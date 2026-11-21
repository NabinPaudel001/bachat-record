import { prisma } from '@/server/db';
import { todayBS, todayNPT } from '@/server/engines/bs';
import { generateDues, fineDue } from '@/server/engines/contributions';
import { getSetting } from '@/server/settings';
import Decimal from 'decimal.js';

export interface CronRunResult {
  job: string;
  runDate: Date;
  duesCreated: number;
  finesPosted: number;
  periodsFinalized: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

/**
 * Execute daily catch-up cron job (Section 11).
 * Completely idempotent and catch-up safe.
 */
export async function runDailyCron(): Promise<CronRunResult> {
  const nptToday = todayNPT();
  const bsToday = todayBS();

  let duesCreated = 0;
  let finesPosted = 0;
  let periodsFinalized = 0;

  try {
    const contributionFineAmt = (await getSetting('contributionFine')) as Decimal;
    const loanInterestFineAmt = (await getSetting('loanInterestFine')) as Decimal;
    const contributionGraceDay = Number(await getSetting('contributionGraceDay'));

    // -------------------------------------------------------------
    // Step 1: Generate missing ContributionDue rows for ACTIVE members
    // -------------------------------------------------------------
    const activeMembers = await prisma.member.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const member of activeMembers) {
      const generated = generateDues(
        {
          id: member.id,
          joinBsYear: member.joinBsYear,
          joinBsMonth: member.joinBsMonth,
          monthlyAmount: member.monthlyAmount,
        },
        bsToday.year,
        bsToday.month,
        contributionGraceDay
      );

      for (const due of generated) {
        // Upsert by [memberId, bsYear, bsMonth]
        const existing = await prisma.contributionDue.findUnique({
          where: {
            memberId_bsYear_bsMonth: {
              memberId: due.memberId,
              bsYear: due.bsYear,
              bsMonth: due.bsMonth,
            },
          },
        });

        if (!existing) {
          // Check if member has advance balance to auto-apply (Section 3.5)
          let paidAmount = new Decimal(0);
          let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
          const memberAdv = new Decimal(member.advanceBalance.toString());

          if (memberAdv.gt(0)) {
            const needed = due.amount;
            const applyAdv = Decimal.min(memberAdv, needed);
            paidAmount = applyAdv;
            status = paidAmount.gte(needed) ? 'PAID' : 'PARTIAL';

            // Decrement member advance
            await prisma.member.update({
              where: { id: member.id },
              data: { advanceBalance: { decrement: applyAdv } },
            });
          }

          await prisma.contributionDue.create({
            data: {
              memberId: due.memberId,
              bsYear: due.bsYear,
              bsMonth: due.bsMonth,
              monthStart: due.monthStart,
              graceEnd: due.graceEnd,
              amount: due.amount,
              paidAmount,
              status,
            },
          });
          duesCreated++;
        }
      }
    }

    // -------------------------------------------------------------
    // Step 2: Post contribution fines for dues past graceEnd
    // -------------------------------------------------------------
    const lateDues = await prisma.contributionDue.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL'] },
        graceEnd: { lt: nptToday },
      },
    });

    for (const due of lateDues) {
      // Check if fine already exists (enforced by unique constraint as well)
      const existingFine = await prisma.fine.findUnique({
        where: {
          type_contributionDueId: {
            type: 'CONTRIBUTION',
            contributionDueId: due.id,
          },
        },
      });

      if (!existingFine) {
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
          try {
            await prisma.fine.create({
              data: {
                memberId: toFine.memberId,
                type: 'CONTRIBUTION',
                amount: toFine.amount,
                postedOn: toFine.postedOn,
                contributionDueId: toFine.contributionDueId,
                status: 'PENDING',
              },
            });
            finesPosted++;
          } catch {
            // Unique constraint caught duplicate concurrent run
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Step 3: Finalise loan interest periods and post loan fines
    // -------------------------------------------------------------
    const activeLoans = await prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      include: { periods: true },
    });

    for (const loan of activeLoans) {
      for (const p of loan.periods) {
        if (!p.finalised && p.periodEnd < nptToday) {
          await prisma.loanInterestPeriod.update({
            where: { id: p.id },
            data: { finalised: true },
          });
          periodsFinalized++;
        }

        // Check for loan interest fine if past graceEnd and unpaid
        if (p.graceEnd < nptToday) {
          const unpaidInterest = new Decimal(p.accrued.toString())
            .minus(new Decimal(p.paid.toString()))
            .minus(new Decimal(p.capitalised.toString()));

          if (unpaidInterest.gt(0)) {
            const existingFine = await prisma.fine.findUnique({
              where: {
                type_loanInterestPeriodId: {
                  type: 'LOAN_INTEREST',
                  loanInterestPeriodId: p.id,
                },
              },
            });

            if (!existingFine) {
              try {
                await prisma.fine.create({
                  data: {
                    memberId: loan.borrowerId,
                    type: 'LOAN_INTEREST',
                    amount: loanInterestFineAmt,
                    postedOn: nptToday,
                    loanInterestPeriodId: p.id,
                    status: 'PENDING',
                  },
                });
                finesPosted++;
              } catch {
                // Ignore unique constraint collision
              }
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Step 5: Record CronRun log
    // -------------------------------------------------------------
    await prisma.cronRun.upsert({
      where: {
        job_runDate: {
          job: 'daily-cron',
          runDate: nptToday,
        },
      },
      update: {
        status: 'SUCCESS',
        details: { duesCreated, finesPosted, periodsFinalized },
      },
      create: {
        job: 'daily-cron',
        runDate: nptToday,
        status: 'SUCCESS',
        details: { duesCreated, finesPosted, periodsFinalized },
      },
    });

    return {
      job: 'daily-cron',
      runDate: nptToday,
      duesCreated,
      finesPosted,
      periodsFinalized,
      status: 'SUCCESS',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Cron error:', err);
    return {
      job: 'daily-cron',
      runDate: nptToday,
      duesCreated,
      finesPosted,
      periodsFinalized,
      status: 'FAILED',
      error: message,
    };
  }
}
