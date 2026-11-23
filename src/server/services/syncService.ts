import { prisma } from '@/server/db';
import { todayBS, todayNPT } from '@/server/engines/bs';
import { generateDues, fineDue } from '@/server/engines/contributions';
import { generateLoanInterestPeriods } from '@/server/engines/loans';
import { getSetting } from '@/server/settings';
import Decimal from 'decimal.js';

// In-memory throttling to prevent redundant database scans on every page load or Next.js prefetch
let isSyncing = false;
let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between auto-syncs

/**
 * Ensure all active members have contribution dues up to current BS month (and targetYear).
 * Posts Rs 200 fine for any missed contributions past the 10-day grace period.
 * Completely batched: Uses Sets and createMany to prevent N+1 query floods.
 */
export async function syncMemberDues(targetYear?: number): Promise<{ duesCreated: number; finesPosted: number }> {
  const nptToday = todayNPT();
  const bsToday = todayBS();
  const upToYear = targetYear ? Math.max(targetYear, bsToday.year) : bsToday.year;
  const upToMonth = upToYear === bsToday.year ? bsToday.month : 12;

  let duesCreated = 0;
  let finesPosted = 0;

  try {
    const contributionFineAmt = (await getSetting('contributionFine')) as Decimal; // Rs 200
    const contributionGraceDay = Number(await getSetting('contributionGraceDay')) || 10;

    // 1. Single batch fetch of active members and existing dues
    const [activeMembers, existingDues] = await Promise.all([
      prisma.member.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          joinBsYear: true,
          joinBsMonth: true,
          monthlyAmount: true,
          advanceBalance: true,
        },
      }),
      prisma.contributionDue.findMany({
        select: {
          id: true,
          memberId: true,
          bsYear: true,
          bsMonth: true,
        },
      }),
    ]);

    const existingDueKeySet = new Set(
      existingDues.map((d) => `${d.memberId}_${d.bsYear}_${d.bsMonth}`)
    );

    const duesToCreate: {
      memberId: string;
      bsYear: number;
      bsMonth: number;
      monthStart: Date;
      graceEnd: Date;
      amount: Decimal;
      paidAmount: Decimal;
      status: 'PENDING' | 'PARTIAL' | 'PAID';
    }[] = [];

    // Members whose advance balance needs decrementing due to auto-apply on new dues
    const advanceDeductions = new Map<string, Decimal>();

    for (const member of activeMembers) {
      const generated = generateDues(
        {
          id: member.id,
          joinBsYear: member.joinBsYear,
          joinBsMonth: member.joinBsMonth,
          monthlyAmount: member.monthlyAmount,
        },
        upToYear,
        upToMonth,
        contributionGraceDay
      );

      let currentMemberAdv = new Decimal(member.advanceBalance.toString()).minus(
        advanceDeductions.get(member.id) ?? new Decimal(0)
      );

      for (const due of generated) {
        const key = `${due.memberId}_${due.bsYear}_${due.bsMonth}`;
        if (existingDueKeySet.has(key)) {
          continue;
        }

        let paidAmount = new Decimal(0);
        let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';

        if (currentMemberAdv.gt(0)) {
          const needed = due.amount;
          const applyAdv = Decimal.min(currentMemberAdv, needed);
          paidAmount = applyAdv;
          status = paidAmount.gte(needed) ? 'PAID' : 'PARTIAL';

          currentMemberAdv = currentMemberAdv.minus(applyAdv);
          const currentTotalDeducted = advanceDeductions.get(member.id) ?? new Decimal(0);
          advanceDeductions.set(member.id, currentTotalDeducted.plus(applyAdv));
        }

        duesToCreate.push({
          memberId: due.memberId,
          bsYear: due.bsYear,
          bsMonth: due.bsMonth,
          monthStart: due.monthStart,
          graceEnd: due.graceEnd,
          amount: due.amount,
          paidAmount,
          status,
        });

        existingDueKeySet.add(key);
      }
    }

    // Batch insert any missing dues
    if (duesToCreate.length > 0) {
      await prisma.contributionDue.createMany({
        data: duesToCreate,
        skipDuplicates: true,
      });
      duesCreated = duesToCreate.length;

      // Update members whose advance balance was applied
      for (const [memberId, deducted] of advanceDeductions.entries()) {
        if (deducted.gt(0)) {
          await prisma.member.update({
            where: { id: memberId },
            data: { advanceBalance: { decrement: deducted } },
          });
        }
      }
    }

    // 2. Batch check for missed contribution fines (Rs 200) past 10-day grace period
    const [lateDues, existingFines] = await Promise.all([
      prisma.contributionDue.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          graceEnd: { lt: nptToday },
        },
        select: {
          id: true,
          memberId: true,
          amount: true,
          paidAmount: true,
          graceEnd: true,
        },
      }),
      prisma.fine.findMany({
        where: { type: 'CONTRIBUTION' },
        select: { contributionDueId: true },
      }),
    ]);

    const existingFineDueSet = new Set(
      existingFines.map((f) => f.contributionDueId).filter(Boolean)
    );

    const finesToCreate: {
      memberId: string;
      type: 'CONTRIBUTION';
      amount: Decimal;
      postedOn: Date;
      contributionDueId: string;
      status: 'PENDING';
    }[] = [];

    for (const due of lateDues) {
      if (existingFineDueSet.has(due.id)) continue;

      const toFine = fineDue(
        {
          id: due.id,
          memberId: due.memberId,
          amount: due.amount,
          paidAmount: due.paidAmount,
          graceEnd: due.graceEnd,
        },
        nptToday,
        contributionFineAmt
      );

      if (toFine) {
        finesToCreate.push({
          memberId: toFine.memberId,
          type: 'CONTRIBUTION',
          amount: toFine.amount,
          postedOn: toFine.postedOn,
          contributionDueId: toFine.contributionDueId,
          status: 'PENDING',
        });
        existingFineDueSet.add(due.id);
      }
    }

    if (finesToCreate.length > 0) {
      await prisma.fine.createMany({
        data: finesToCreate,
        skipDuplicates: true,
      });
      finesPosted = finesToCreate.length;
    }
  } catch (err) {
    console.error('Error syncing member dues:', err);
  }

  return { duesCreated, finesPosted };
}

/**
 * Ensure active loans have up-to-date daily accrued interest periods and missed interest fines.
 * - Accrues daily interest for the current month up to today (NOT fined during grace period).
 * - Posts Rs 100 fine for any past months whose 10-day grace period has expired with unpaid interest.
 * Completely batched: Queries existing periods once and only updates if accrued value changed.
 */
export async function syncLoanInterest(today?: Date): Promise<{ periodsSynced: number; finesPosted: number }> {
  const nptToday = today || todayNPT();
  let periodsSynced = 0;
  let finesPosted = 0;

  try {
    const loanInterestFineAmt = (await getSetting('loanInterestFine')) as Decimal; // Rs 100
    const loanInterestGraceDay = Number(await getSetting('loanInterestGraceDay')) || 10;
    const dayCountBasis = Number(await getSetting('dayCountBasis')) || 365;

    // Single query to fetch active loans with their existing periods
    const [activeLoans, existingFines] = await Promise.all([
      prisma.loan.findMany({
        where: { status: 'ACTIVE' },
        include: {
          periods: true,
        },
      }),
      prisma.fine.findMany({
        where: { type: 'LOAN_INTEREST' },
        select: { loanInterestPeriodId: true },
      }),
    ]);

    const existingFinePeriodSet = new Set(
      existingFines.map((f) => f.loanInterestPeriodId).filter(Boolean)
    );

    const periodsToCreate: {
      loanId: string;
      bsYear: number;
      bsMonth: number;
      periodStart: Date;
      periodEnd: Date;
      graceEnd: Date;
      accrued: Decimal;
      paid: Decimal;
      capitalised: Decimal;
      finalised: boolean;
    }[] = [];

    const periodsToUpdate: {
      id: string;
      accrued: Decimal;
      finalised: boolean;
    }[] = [];

    // Track newly planned fines
    const finesToCreate: {
      memberId: string;
      type: 'LOAN_INTEREST';
      amount: Decimal;
      postedOn: Date;
      loanInterestPeriodId: string;
      status: 'PENDING';
    }[] = [];

    for (const loan of activeLoans) {
      const principal = new Decimal(loan.principalOutstanding.toString());
      if (principal.lte(0)) continue;

      const rate = loan.rateAtStart;
      const disbursedOn = loan.disbursedOn || new Date();

      const calculatedPeriods = generateLoanInterestPeriods(
        {
          id: loan.id,
          disbursedOn,
          principalOutstanding: principal,
          rate,
        },
        nptToday,
        dayCountBasis,
        loanInterestGraceDay
      );

      const existingPeriodMap = new Map(
        loan.periods.map((p) => [`${p.bsYear}_${p.bsMonth}`, p])
      );

      for (const cp of calculatedPeriods) {
        const key = `${cp.bsYear}_${cp.bsMonth}`;
        const existing = existingPeriodMap.get(key);

        if (!existing) {
          periodsToCreate.push({
            loanId: loan.id,
            bsYear: cp.bsYear,
            bsMonth: cp.bsMonth,
            periodStart: cp.periodStart,
            periodEnd: cp.periodEnd,
            graceEnd: cp.graceEnd,
            accrued: cp.accrued,
            paid: new Decimal(0),
            capitalised: new Decimal(0),
            finalised: cp.finalised,
          });
        } else {
          // Only update if values actually changed to avoid running endless redundant UPDATE queries!
          const needsAccruedUpdate =
            !existing.finalised && !new Decimal(existing.accrued.toString()).equals(cp.accrued);
          const needsFinalisedUpdate = !existing.finalised && cp.finalised;

          if (needsAccruedUpdate || needsFinalisedUpdate) {
            periodsToUpdate.push({
              id: existing.id,
              accrued: cp.accrued,
              finalised: cp.finalised,
            });
          }

          // Check if fine is due on existing past period
          if (cp.isEligibleForFine && !existingFinePeriodSet.has(existing.id)) {
            const unpaid = new Decimal(existing.accrued.toString())
              .minus(new Decimal(existing.paid.toString()))
              .minus(new Decimal(existing.capitalised.toString()));

            if (unpaid.gt(0)) {
              finesToCreate.push({
                memberId: loan.borrowerId,
                type: 'LOAN_INTEREST',
                amount: loanInterestFineAmt, // Rs 100
                postedOn: nptToday,
                loanInterestPeriodId: existing.id,
                status: 'PENDING',
              });
              existingFinePeriodSet.add(existing.id);
            }
          }
        }
      }
    }

    // Batch insert new periods
    if (periodsToCreate.length > 0) {
      await prisma.loanInterestPeriod.createMany({
        data: periodsToCreate,
        skipDuplicates: true,
      });
      periodsSynced += periodsToCreate.length;
    }

    // Only update periods that changed (typically 0 or 1 per loan, and only once per day)
    for (const update of periodsToUpdate) {
      await prisma.loanInterestPeriod.update({
        where: { id: update.id },
        data: {
          accrued: update.accrued,
          finalised: update.finalised,
        },
      });
      periodsSynced++;
    }

    // Batch insert new loan interest fines
    if (finesToCreate.length > 0) {
      await prisma.fine.createMany({
        data: finesToCreate,
        skipDuplicates: true,
      });
      finesPosted = finesToCreate.length;
    }
  } catch (err) {
    console.error('Error syncing loan interest periods:', err);
  }

  return { periodsSynced, finesPosted };
}

/**
 * Sync both member dues and loan interest calculations idempotently.
 * Protected with in-memory lock and cooldown to prevent query spam on multiple page requests.
 */
export async function syncAllFinancials(targetYear?: number, force = false) {
  const now = Date.now();
  if (isSyncing) {
    return { duesCreated: 0, finesPosted: 0, periodsSynced: 0 };
  }
  if (!force && now - lastSyncTimestamp < SYNC_COOLDOWN_MS) {
    return { duesCreated: 0, finesPosted: 0, periodsSynced: 0 };
  }

  isSyncing = true;
  try {
    const [duesRes, loanRes] = await Promise.all([
      syncMemberDues(targetYear),
      syncLoanInterest(),
    ]);
    lastSyncTimestamp = Date.now();
    return { ...duesRes, ...loanRes };
  } finally {
    isSyncing = false;
  }
}
