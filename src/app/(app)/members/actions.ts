'use server';

import { createMember } from '@/server/services/memberService';
import { generateNextLoanNo } from '@/server/services/loanService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role, DueStatus, LoanStatus, FineStatus, FineType } from '@prisma/client';
import { prisma } from '@/server/db';
import { bsFromAd, adFromBs, graceEndOf, bsMonthRange } from '@/server/engines/bs';
import Decimal from 'decimal.js';
import { z } from 'zod';

const AddMemberSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  phone: z.string().min(5, 'Valid phone is required'),
  altPhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  permanentAddress: z.string().min(2, 'Address is required'),
  currentAddress: z.string().optional(),
  idNumber: z.string().optional(),
  joinDate: z.string(),
  monthlyAmount: z.string().refine((val) => Number(val) > 0, 'Must be positive'),
  nomineeName: z.string().optional(),
  nomineeRelation: z.string().optional(),
  nomineePhone: z.string().optional(),
});

export async function addMemberAction(formData: FormData) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);

  const raw = {
    fullName: formData.get('fullName') as string,
    phone: formData.get('phone') as string,
    altPhone: (formData.get('altPhone') as string) || undefined,
    email: (formData.get('email') as string) || undefined,
    permanentAddress: formData.get('permanentAddress') as string,
    currentAddress: (formData.get('currentAddress') as string) || undefined,
    idNumber: (formData.get('idNumber') as string) || undefined,
    joinDate: formData.get('joinDate') as string,
    monthlyAmount: formData.get('monthlyAmount') as string,
    nomineeName: (formData.get('nomineeName') as string) || undefined,
    nomineeRelation: (formData.get('nomineeRelation') as string) || undefined,
    nomineePhone: (formData.get('nomineePhone') as string) || undefined,
  };

  const parsed = AddMemberSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input data' };
  }

  const joinDate = new Date(parsed.data.joinDate);

  const newMember = await createMember({
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    altPhone: parsed.data.altPhone,
    email: parsed.data.email || null,
    permanentAddress: parsed.data.permanentAddress,
    currentAddress: parsed.data.currentAddress || null,
    idNumber: parsed.data.idNumber || null,
    joinDate,
    monthlyAmount: parsed.data.monthlyAmount,
    nomineeName: parsed.data.nomineeName || null,
    nomineeRelation: parsed.data.nomineeRelation || null,
    nomineePhone: parsed.data.nomineePhone || null,
    memberClass: 'D', // Auto recorded as D class for new members
  });

  await auditLog({
    userId: user.id,
    action: 'CREATE_MEMBER',
    entity: 'Member',
    entityId: newMember.id,
    after: { memberNo: newMember.memberNo, fullName: newMember.fullName },
  });

  revalidatePath('/members');
  return { success: true, memberId: newMember.id };
}

// ── Add Existing Member (with historical data) ──

export interface AddExistingMemberInput {
  fullName: string;
  phone: string;
  altPhone?: string;
  email?: string;
  permanentAddress: string;
  currentAddress?: string;
  idNumber?: string;
  dob?: string;
  joinDate: string;
  monthlyAmount: string | number;
  bankDetails?: string;
  notes?: string;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  nomineeId?: string;

  // Class selection (A, B, or C)
  memberClass?: 'A' | 'B' | 'C' | string;

  // 7 Existing Financial Records
  monthlyLevyAccumulated?: number | string;
  monthlyLevyDue?: number | string;
  monthlyLevyFine?: number | string;
  loanAmountRemaining?: number | string;
  loanInterestRemaining?: number | string;
  loanInterestFine?: number | string;
  advanceBalance?: number | string;

  // Legacy arrays for backward compatibility
  contributions?: Array<{
    bsYear: number;
    bsMonth: number;
    amount: number;
    paidAmount: number;
    status: 'PAID' | 'PENDING' | 'PARTIAL';
  }>;
  loans?: Array<{
    loanNo?: string;
    amount: number;
    disbursedOn?: string;
    purpose?: string;
    status: 'ACTIVE' | 'CLOSED';
    principalOutstanding?: number;
    guarantorCodes?: string[];
  }>;
  fines?: Array<{
    type: 'CONTRIBUTION' | 'LOAN_INTEREST';
    amount: number;
    paidAmount: number;
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
    postedOn: string;
  }>;
}

export async function addExistingMemberAction(data: AddExistingMemberInput) {
  const user = await requireRole(Role.ADMIN);

  try {
    const joinDate = new Date(data.joinDate);
    const advanceBalance = new Decimal(data.advanceBalance?.toString() || '0');
    const chosenClass = (data.memberClass || 'A').toString().trim();

    // Create member first (outside transaction to get memberNo)
    const member = await createMember({
      fullName: data.fullName,
      phone: data.phone,
      altPhone: data.altPhone || null,
      email: data.email || null,
      permanentAddress: data.permanentAddress,
      currentAddress: data.currentAddress || null,
      idNumber: data.idNumber || null,
      dob: data.dob ? new Date(data.dob) : null,
      joinDate,
      monthlyAmount: data.monthlyAmount,
      advanceBalance,
      memberClass: chosenClass,
      bankDetails: data.bankDetails || null,
      notes: data.notes || null,
      nomineeName: data.nomineeName || null,
      nomineeRelation: data.nomineeRelation || null,
      nomineePhone: data.nomineePhone || null,
      nomineeId: data.nomineeId || null,
    });

    // Create historical records in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Create ContributionDue records
      if (data.contributions && data.contributions.length > 0) {
        for (const c of data.contributions) {
          const monthStart = adFromBs(c.bsYear, c.bsMonth, 1);
          const graceEnd = graceEndOf(c.bsYear, c.bsMonth, 15);
          await tx.contributionDue.create({
            data: {
              memberId: member.id,
              bsYear: c.bsYear,
              bsMonth: c.bsMonth,
              amount: new Decimal(c.amount),
              paidAmount: new Decimal(c.paidAmount),
              status: c.status as DueStatus,
              monthStart,
              graceEnd,
            },
          });
        }
      } else {
        // Generate dues from Monthly Levy Accumulated and Monthly Levy Due amounts
        const monthlyAmt = Math.max(1, Number(data.monthlyAmount) || 1000);
        let dueRemaining = Math.max(0, Number(data.monthlyLevyDue) || 0);
        let accRemaining = Math.max(0, Number(data.monthlyLevyAccumulated) || 0);

        const curBs = bsFromAd(new Date());
        let curYear = curBs.year;
        let curMonth = curBs.month;

        // Create unpaid due months working backwards from current month
        while (dueRemaining > 0) {
          const mDue = Math.min(dueRemaining, monthlyAmt);
          dueRemaining -= mDue;
          const isPartial = mDue < monthlyAmt;
          await tx.contributionDue.create({
            data: {
              memberId: member.id,
              bsYear: curYear,
              bsMonth: curMonth,
              amount: new Decimal(monthlyAmt),
              paidAmount: new Decimal(isPartial ? monthlyAmt - mDue : 0),
              status: isPartial ? DueStatus.PARTIAL : DueStatus.PENDING,
              monthStart: adFromBs(curYear, curMonth, 1),
              graceEnd: graceEndOf(curYear, curMonth, 15),
            },
          });
          curMonth--;
          if (curMonth < 1) {
            curMonth = 12;
            curYear--;
          }
        }

        // Create accumulated (paid) months continuing backwards
        while (accRemaining > 0) {
          const mAcc = Math.min(accRemaining, monthlyAmt);
          accRemaining -= mAcc;
          const isPartial = mAcc < monthlyAmt;
          await tx.contributionDue.create({
            data: {
              memberId: member.id,
              bsYear: curYear,
              bsMonth: curMonth,
              amount: new Decimal(monthlyAmt),
              paidAmount: new Decimal(mAcc),
              status: isPartial ? DueStatus.PARTIAL : DueStatus.PAID,
              monthStart: adFromBs(curYear, curMonth, 1),
              graceEnd: graceEndOf(curYear, curMonth, 15),
            },
          });
          curMonth--;
          if (curMonth < 1) {
            curMonth = 12;
            curYear--;
          }
        }
      }

      // 2. Create Loan records
      let createdLoanId: string | null = null;
      if (data.loans && data.loans.length > 0) {
        let loanCounter = 1;
        for (const l of data.loans) {
          const loanNo = l.loanNo || `HIST-${String(loanCounter++).padStart(3, '0')}`;
          const loan = await tx.loan.create({
            data: {
              borrowerId: member.id,
              loanNo,
              amount: new Decimal(l.amount),
              principalOutstanding: new Decimal(l.principalOutstanding ?? (l.status === 'CLOSED' ? 0 : l.amount)),
              status: l.status as LoanStatus,
              disbursedOn: l.disbursedOn ? new Date(l.disbursedOn) : joinDate,
              purpose: l.purpose || 'Historical import',
              rateAtStart: new Decimal(12),
            },
          });
          createdLoanId = loan.id;

          if (l.status === 'ACTIVE' && l.guarantorCodes && l.guarantorCodes.length > 0) {
            for (const code of l.guarantorCodes) {
              const guarantor = await tx.member.findFirst({
                where: { memberNo: code.trim() },
                select: { id: true },
              });
              if (guarantor) {
                await tx.loanGuarantor.create({
                  data: {
                    loanId: loan.id,
                    memberId: guarantor.id,
                  },
                });
              }
            }
          }
        }
      } else {
        const principal = Math.max(0, Number(data.loanAmountRemaining) || 0);
        const interest = Math.max(0, Number(data.loanInterestRemaining) || 0);

        if (principal > 0 || interest > 0) {
          const loanNo = await generateNextLoanNo();
          const loan = await tx.loan.create({
            data: {
              borrowerId: member.id,
              loanNo,
              amount: new Decimal(principal > 0 ? principal : 0),
              principalOutstanding: new Decimal(principal > 0 ? principal : 0),
              status: LoanStatus.ACTIVE,
              disbursedOn: joinDate,
              purpose: 'Existing Member Loan',
              rateAtStart: new Decimal(12),
            },
          });
          createdLoanId = loan.id;

          if (interest > 0) {
            const curBs = bsFromAd(new Date());
            const periodRange = bsMonthRange(curBs.year, curBs.month);
            const graceEnd = graceEndOf(curBs.year, curBs.month, 10);
            await tx.loanInterestPeriod.create({
              data: {
                loanId: loan.id,
                bsYear: curBs.year,
                bsMonth: curBs.month,
                periodStart: periodRange.start,
                periodEnd: periodRange.end,
                graceEnd,
                accrued: new Decimal(interest),
                paid: new Decimal(0),
                capitalised: new Decimal(0),
                finalised: false,
              },
            });
          }
        }
      }

      // 3. Create Fine records
      if (data.fines && data.fines.length > 0) {
        for (const f of data.fines) {
          await tx.fine.create({
            data: {
              memberId: member.id,
              type: f.type as FineType,
              amount: new Decimal(f.amount),
              paidAmount: new Decimal(f.paidAmount),
              waivedAmount: new Decimal(0),
              status: f.status as FineStatus,
              postedOn: new Date(f.postedOn),
            },
          });
        }
      } else {
        const levyFine = Math.max(0, Number(data.monthlyLevyFine) || 0);
        if (levyFine > 0) {
          await tx.fine.create({
            data: {
              memberId: member.id,
              type: FineType.CONTRIBUTION,
              amount: new Decimal(levyFine),
              paidAmount: new Decimal(0),
              waivedAmount: new Decimal(0),
              status: FineStatus.PENDING,
              postedOn: new Date(),
            },
          });
        }

        const loanFine = Math.max(0, Number(data.loanInterestFine) || 0);
        if (loanFine > 0) {
          await tx.fine.create({
            data: {
              memberId: member.id,
              type: FineType.LOAN_INTEREST,
              amount: new Decimal(loanFine),
              paidAmount: new Decimal(0),
              waivedAmount: new Decimal(0),
              status: FineStatus.PENDING,
              postedOn: new Date(),
            },
          });
        }
      }
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE_EXISTING_MEMBER',
      entity: 'Member',
      entityId: member.id,
      after: {
        memberNo: member.memberNo,
        fullName: member.fullName,
        memberClass: chosenClass,
      },
    });

    revalidatePath('/members');
    return { success: true, memberId: member.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

// ── Developer Actions: Remove Member & Reset All Records ──

export async function removeMemberAction(memberId: string) {
  const user = await requireRole(Role.ADMIN);

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Unlink any rejoining links pointing to this member
      await tx.member.updateMany({
        where: { previousMemberId: memberId },
        data: { previousMemberId: null },
      });

      // 2. Identify all loans of this member
      const memberLoans = await tx.loan.findMany({
        where: { borrowerId: memberId },
        select: { id: true },
      });
      const loanIds = memberLoans.map((l) => l.id);

      // 3. Identify all dues, fines, payments, and interest periods
      const memberPayments = await tx.payment.findMany({
        where: { memberId },
        select: { id: true },
      });
      const paymentIds = memberPayments.map((p) => p.id);

      const memberDues = await tx.contributionDue.findMany({
        where: { memberId },
        select: { id: true },
      });
      const dueIds = memberDues.map((d) => d.id);

      const memberFines = await tx.fine.findMany({
        where: { memberId },
        select: { id: true },
      });
      const fineIds = memberFines.map((f) => f.id);

      const memberPeriods = await tx.loanInterestPeriod.findMany({
        where: { loanId: { in: loanIds } },
        select: { id: true },
      });
      const periodIds = memberPeriods.map((p) => p.id);

      // 4. Delete all PaymentAllocations
      await tx.paymentAllocation.deleteMany({
        where: {
          OR: [
            { paymentId: { in: paymentIds } },
            { dueId: { in: dueIds } },
            { fineId: { in: fineIds } },
            { loanId: { in: loanIds } },
            { interestPeriodId: { in: periodIds } },
          ],
        },
      });

      // 5. Delete Payments
      await tx.payment.deleteMany({
        where: { memberId },
      });

      // 6. Delete Fines
      await tx.fine.deleteMany({
        where: {
          OR: [
            { memberId },
            { contributionDueId: { in: dueIds } },
            { loanInterestPeriodId: { in: periodIds } },
          ],
        },
      });

      // 7. Delete Loan Events, Periods, Guarantors, and Loans
      if (loanIds.length > 0) {
        await tx.loanEvent.deleteMany({
          where: { loanId: { in: loanIds } },
        });
        await tx.loanInterestPeriod.deleteMany({
          where: { loanId: { in: loanIds } },
        });
        await tx.loanGuarantor.deleteMany({
          where: { loanId: { in: loanIds } },
        });
        await tx.loan.deleteMany({
          where: { id: { in: loanIds } },
        });
      }

      // Delete any guarantees where this member was guarantor
      await tx.loanGuarantor.deleteMany({
        where: { memberId },
      });

      // 8. Delete Contribution Dues
      await tx.contributionDue.deleteMany({
        where: { memberId },
      });

      // 9. Delete Member Documents
      await tx.memberDocument.deleteMany({
        where: { memberId },
      });

      // 10. Delete Distribution Lines
      await tx.distributionLine.deleteMany({
        where: { memberId },
      });

      // 11. Delete Savings Accruals
      await tx.savingsAccrual.deleteMany({
        where: { memberId },
      });

      // 12. Delete the Member
      await tx.member.delete({
        where: { id: memberId },
      });
    });

    await auditLog({
      userId: user.id,
      action: 'REMOVE_MEMBER_DEV',
      entity: 'Member',
      entityId: memberId,
      after: { removed: true },
    });

    revalidatePath('/members');
    revalidatePath('/payments');
    revalidatePath('/loans');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function resetAllRecordsAction() {
  const user = await requireRole(Role.ADMIN);

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete all payment allocations
      await tx.paymentAllocation.deleteMany();

      // 2. Delete all payments
      await tx.payment.deleteMany();

      // 3. Delete all fines
      await tx.fine.deleteMany();

      // 4. Delete all loan events, periods, guarantors, loans
      await tx.loanEvent.deleteMany();
      await tx.loanInterestPeriod.deleteMany();
      await tx.loanGuarantor.deleteMany();
      await tx.loan.deleteMany();

      // 5. Delete all dues
      await tx.contributionDue.deleteMany();

      // 6. Delete all distribution lines and distributions
      await tx.distributionLine.deleteMany();
      await tx.distribution.deleteMany();

      // 7. Delete all savings accruals
      await tx.savingsAccrual.deleteMany();

      // 8. Delete all member documents
      await tx.memberDocument.deleteMany();

      // 9. Delete all members
      await tx.member.deleteMany();

      // 10. Attempt to reset journals if triggers allow
      try {
        await tx.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER ALL;`);
        await tx.$executeRawUnsafe(`ALTER TABLE "Journal" DISABLE TRIGGER ALL;`);
        await tx.$executeRawUnsafe(`DELETE FROM "JournalLine";`);
        await tx.$executeRawUnsafe(`DELETE FROM "Journal";`);
        await tx.$executeRawUnsafe(`ALTER TABLE "Journal" ENABLE TRIGGER ALL;`);
        await tx.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER ALL;`);
      } catch {
        // If trigger permissions restrict, continue
      }
    });

    await auditLog({
      userId: user.id,
      action: 'RESET_ALL_RECORDS_DEV',
      entity: 'System',
      entityId: 'ALL',
      after: { reset: true },
    });

    revalidatePath('/members');
    revalidatePath('/payments');
    revalidatePath('/loans');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
