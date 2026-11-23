import { prisma } from '@/server/db';
import { validateGuarantors, capitalise } from '@/server/engines/loans';
import { postJournal } from './ledgerService';
import Decimal from 'decimal.js';
import { LoanStatus, Role } from '@prisma/client';

export interface ProposeLoanInput {
  borrowerId: string;
  amount: Decimal | string | number;
  purpose?: string;
  guarantorMemberIds: string[];
  proposerUserId: string;
}

/**
 * Generate next loan number (LN-0001, LN-0002...).
 */
export async function generateNextLoanNo(): Promise<string> {
  const last = await prisma.loan.findFirst({
    orderBy: { loanNo: 'desc' },
    select: { loanNo: true },
  });

  if (!last || !last.loanNo.startsWith('LN-')) {
    return 'LN-0001';
  }

  const num = parseInt(last.loanNo.replace('LN-', ''), 10);
  if (isNaN(num)) return 'LN-0001';
  return `LN-${String(num + 1).padStart(4, '0')}`;
}

/**
 * Propose a loan (Treasurer or Admin).
 */
export async function proposeLoan(input: ProposeLoanInput) {
  const amount = new Decimal(input.amount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (amount.lte(0)) {
    throw new Error('Loan amount must be greater than zero.');
  }

  // 1. Borrower must be ACTIVE
  const borrower = await prisma.member.findUnique({
    where: { id: input.borrowerId },
  });
  if (!borrower || borrower.status !== 'ACTIVE') {
    throw new Error('Borrower must be an ACTIVE member.');
  }

  // 2. Fetch active members for guarantor validation
  const activeMembers = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  const activeIds = new Set(activeMembers.map((m) => m.id));

  // 3. Exactly 3 guarantors, all active, all distinct, none the borrower
  const val = validateGuarantors(input.borrowerId, input.guarantorMemberIds, activeIds);
  if (!val.valid) {
    throw new Error(val.error);
  }

  // 4. Current loan rate
  const latestRate = await prisma.rateHistory.findFirst({
    where: { type: 'LOAN' },
    orderBy: { effectiveFrom: 'desc' },
  });
  const rateAtStart = latestRate ? latestRate.ratePercent : new Decimal(12);

  const loanNo = await generateNextLoanNo();

  return prisma.loan.create({
    data: {
      loanNo,
      borrowerId: input.borrowerId,
      amount,
      principalOutstanding: amount,
      rateAtStart,
      purpose: input.purpose,
      status: LoanStatus.PENDING_APPROVAL,
      guarantors: {
        create: input.guarantorMemberIds.map((gid) => ({
          memberId: gid,
        })),
      },
    },
    include: {
      guarantors: { include: { member: true } },
    },
  });
}

/**
 * Update loan information before approval (Admin only).
 */
export async function updatePendingLoan(params: {
  loanId: string;
  amount?: Decimal | string | number;
  rateAtStart?: Decimal | string | number;
  purpose?: string;
  adminUser: { id: string; role: Role };
}) {
  if (params.adminUser.role !== Role.ADMIN) {
    throw new Error('Only Admin can update loan information.');
  }

  const loan = await prisma.loan.findUnique({
    where: { id: params.loanId },
  });

  if (!loan) throw new Error('Loan not found');
  if (loan.status !== LoanStatus.PENDING_APPROVAL) {
    throw new Error(`Cannot update loan with status ${loan.status}. Only pending loans can be modified.`);
  }

  const data: Record<string, unknown> = {};
  if (params.amount !== undefined) {
    const dec = new Decimal(params.amount.toString());
    data.amount = dec;
    data.principalOutstanding = dec;
  }
  if (params.rateAtStart !== undefined) {
    data.rateAtStart = new Decimal(params.rateAtStart.toString());
  }
  if (params.purpose !== undefined) {
    data.purpose = params.purpose;
  }

  return prisma.loan.update({
    where: { id: params.loanId },
    data,
  });
}

/**
 * Approve & Disburse loan with optional loan info updates (Admin only).
 */
export async function approveAndDisburseLoan(params: {
  loanId: string;
  disbursementDate: Date;
  amount?: Decimal | string | number;
  rateAtStart?: Decimal | string | number;
  purpose?: string;
  adminUser: { id: string; role: Role };
}) {
  if (params.adminUser.role !== Role.ADMIN) {
    throw new Error('Only Admin can approve and disburse loans.');
  }

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: params.loanId },
      include: { borrower: true },
    });

    if (!loan) throw new Error('Loan not found');
    if (loan.status !== LoanStatus.PENDING_APPROVAL) {
      throw new Error(`Loan is already ${loan.status}.`);
    }

    const finalAmount =
      params.amount !== undefined ? new Decimal(params.amount.toString()) : loan.amount;
    const finalRate =
      params.rateAtStart !== undefined ? new Decimal(params.rateAtStart.toString()) : loan.rateAtStart;
    const finalPurpose =
      params.purpose !== undefined ? params.purpose : loan.purpose;

    // 1. Post Disbursement Journal:
    // Debit 1200 Loans Receivable
    // Credit 1000 Cash
    const journal = await postJournal(
      {
        date: params.disbursementDate,
        description: `Loan Disbursement - Loan ${loan.loanNo} to ${loan.borrower.fullName}`,
        refType: 'LOAN',
        refId: loan.id,
        createdById: params.adminUser.id,
        lines: [
          { accountCode: '1200', debit: finalAmount, memberId: loan.borrowerId },
          { accountCode: '1000', credit: finalAmount, memberId: loan.borrowerId },
        ],
      },
      tx
    );

    // 2. Record LoanEvent DISBURSE
    await tx.loanEvent.create({
      data: {
        loanId: loan.id,
        type: 'DISBURSE',
        amount: finalAmount,
        eventDate: params.disbursementDate,
        principalAfter: finalAmount,
        journalId: journal.id,
        reason: finalPurpose || 'Initial loan disbursement',
      },
    });

    // 3. Update loan status to ACTIVE with finalized details
    return tx.loan.update({
      where: { id: loan.id },
      data: {
        amount: finalAmount,
        principalOutstanding: finalAmount,
        rateAtStart: finalRate,
        purpose: finalPurpose,
        status: LoanStatus.ACTIVE,
        disbursedOn: params.disbursementDate,
        approvedById: params.adminUser.id,
      },
    });
  });
}

/**
 * Convert unpaid interest to principal / Capitalise interest (Admin only, Section 3.7).
 */
export async function convertInterestToPrincipal(params: {
  loanId: string;
  amount: Decimal | string | number;
  reason: string;
  adminUser: { id: string; role: Role };
}) {
  if (params.adminUser.role !== Role.ADMIN) {
    throw new Error('Only Admin can capitalise interest to principal.');
  }

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: params.loanId },
      include: { periods: true, borrower: true },
    });

    if (!loan) throw new Error('Loan not found');
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new Error('Loan is not active.');
    }

    const unpaidPeriods = loan.periods.map((p) => ({
      id: p.id,
      accrued: new Decimal(p.accrued.toString()),
      paid: new Decimal(p.paid.toString()),
      capitalised: new Decimal(p.capitalised.toString()),
    }));

    const result = capitalise(loan.principalOutstanding, unpaidPeriods, params.amount);

    if (result.totalCapitalised.isZero()) {
      throw new Error('No unpaid interest available to capitalise.');
    }

    // 1. Update periods' capitalised amounts
    for (const update of result.periodUpdates) {
      await tx.loanInterestPeriod.update({
        where: { id: update.id },
        data: {
          capitalised: { increment: update.addCapitalised },
        },
      });
    }

    // 2. Post non-cash journal (Section 3.12):
    // Debit 1200 Loans Receivable
    // Credit 4000 Loan Interest Income
    const today = new Date();
    const journal = await postJournal(
      {
        date: today,
        description: `Interest Capitalised to Principal - Loan ${loan.loanNo}: ${params.reason}`,
        refType: 'LOAN',
        refId: loan.id,
        createdById: params.adminUser.id,
        lines: [
          { accountCode: '1200', debit: result.totalCapitalised, memberId: loan.borrowerId },
          { accountCode: '4000', credit: result.totalCapitalised, memberId: loan.borrowerId },
        ],
      },
      tx
    );

    // 3. Create LoanEvent CAPITALISE
    await tx.loanEvent.create({
      data: {
        loanId: loan.id,
        type: 'CAPITALISE',
        amount: result.totalCapitalised,
        eventDate: today,
        principalAfter: result.newPrincipal,
        journalId: journal.id,
        reason: params.reason,
      },
    });

    // 4. Update loan principalOutstanding
    return tx.loan.update({
      where: { id: loan.id },
      data: {
        principalOutstanding: result.newPrincipal,
      },
    });
  });
}

/**
 * Replace a guarantor on an active loan (Section 3.14).
 */
export async function replaceGuarantor(params: {
  loanId: string;
  oldMemberId: string;
  newMemberId: string;
  adminUser: { id: string; role: Role };
}) {
  if (params.adminUser.role !== Role.ADMIN) {
    throw new Error('Only Admin can replace guarantors.');
  }

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: params.loanId },
      include: { guarantors: true },
    });
    if (!loan) throw new Error('Loan not found');

    const newMember = await tx.member.findUnique({
      where: { id: params.newMemberId },
    });
    if (!newMember || newMember.status !== 'ACTIVE') {
      throw new Error('New guarantor must be an ACTIVE member.');
    }

    if (loan.borrowerId === params.newMemberId) {
      throw new Error('Borrower cannot be a guarantor for their own loan.');
    }

    // Check if new guarantor is already a guarantor on this loan
    const alreadyGuarantor = loan.guarantors.some(
      (g) => g.memberId === params.newMemberId && g.replacedOn === null
    );
    if (alreadyGuarantor) {
      throw new Error('Selected member is already an active guarantor on this loan.');
    }

    // Mark old guarantor as replaced
    await tx.loanGuarantor.updateMany({
      where: {
        loanId: params.loanId,
        memberId: params.oldMemberId,
        replacedOn: null,
      },
      data: {
        replacedOn: new Date(),
      },
    });

    // Add new guarantor
    return tx.loanGuarantor.create({
      data: {
        loanId: params.loanId,
        memberId: params.newMemberId,
      },
    });
  });
}

/**
 * Waive a fine fully or partially (Admin only, Section 3.13).
 * A waived fine posts NO journal (Section 3.12, 16.7).
 */
export async function waiveFine(params: {
  fineId: string;
  waiveAmount?: Decimal | string | number; // if omitted, waives entire remaining balance
  reason: string;
  adminUser: { id: string; role: Role };
}) {
  if (params.adminUser.role !== Role.ADMIN) {
    throw new Error('Only Admin can waive fines.');
  }

  return prisma.$transaction(async (tx) => {
    const fine = await tx.fine.findUnique({ where: { id: params.fineId } });
    if (!fine) throw new Error('Fine not found');

    const fAmt = new Decimal(fine.amount.toString());
    const fPaid = new Decimal(fine.paidAmount.toString());
    const fWaived = new Decimal(fine.waivedAmount.toString());
    const remaining = fAmt.minus(fPaid).minus(fWaived);

    if (remaining.lte(0)) {
      throw new Error('Fine has no remaining balance to waive.');
    }

    let toWaive = remaining;
    if (params.waiveAmount) {
      toWaive = Decimal.min(remaining, new Decimal(params.waiveAmount.toString()));
    }

    const newWaived = fWaived.plus(toWaive);
    const isFullyWaived = newWaived.plus(fPaid).gte(fAmt);

    return tx.fine.update({
      where: { id: params.fineId },
      data: {
        waivedAmount: newWaived,
        status: isFullyWaived ? 'WAIVED' : 'PARTIAL',
        waiveReason: params.reason,
        waivedById: params.adminUser.id,
      },
    });
  });
}
