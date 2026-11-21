import { prisma } from '@/server/db';
import { allocateContribution } from '@/server/engines/contributions';
import { allocateLoanPayment } from '@/server/engines/loans';
import { postJournal, JournalLineInput } from './ledgerService';
import { getSetting } from '@/server/settings';
import Decimal from 'decimal.js';
import { PaymentKind, PaymentStatus, Role, AllocTarget, Prisma } from '@prisma/client';

export interface RecordPaymentParams {
  memberId: string;
  kind: PaymentKind;
  loanId?: string;
  amount: Decimal | string | number;
  method: string;
  paymentDate: Date;
  receiptNo: string;
  idempotencyKey: string;
  note?: string;
  user: { id: string; role: Role };
}

/**
 * Record a payment (Contribution or Loan).
 * Handles idempotency, Maker-Checker rules, allocations, and double-entry posting.
 */
export async function recordPayment(params: RecordPaymentParams) {
  // 1. Idempotency check: if existing with same key, return it
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    include: { allocations: true },
  });
  if (existing) {
    return existing;
  }

  const amount = new Decimal(params.amount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (amount.lte(0)) {
    throw new Error('Payment amount must be greater than zero.');
  }

  // 2. Maker-checker check: if user is HELPER and setting is enabled
  const helperNeedsApproval = Boolean(await getSetting('helperPaymentsNeedApproval'));
  const isHelper = params.user.role === Role.HELPER;
  const status: PaymentStatus = isHelper && helperNeedsApproval
    ? PaymentStatus.PENDING_APPROVAL
    : PaymentStatus.POSTED;

  // 3. Process inside a transaction
  return prisma.$transaction(async (tx) => {
    // If pending approval, we only save the payment record without applying allocations or journal
    if (status === PaymentStatus.PENDING_APPROVAL) {
      return tx.payment.create({
        data: {
          receiptNo: params.receiptNo,
          memberId: params.memberId,
          kind: params.kind,
          loanId: params.loanId,
          amount,
          method: params.method,
          paymentDate: params.paymentDate,
          status: PaymentStatus.PENDING_APPROVAL,
          idempotencyKey: params.idempotencyKey,
          note: params.note,
          enteredById: params.user.id,
        },
      });
    }

    // Otherwise, apply immediately
    return applyPaymentToLedger(tx, {
      receiptNo: params.receiptNo,
      memberId: params.memberId,
      kind: params.kind,
      loanId: params.loanId,
      amount,
      method: params.method,
      paymentDate: params.paymentDate,
      idempotencyKey: params.idempotencyKey,
      note: params.note,
      enteredById: params.user.id,
      approvedById: params.user.id,
    });
  });
}

/**
 * Approve a pending Helper payment (Admin or Treasurer only).
 */
export async function approvePayment(paymentId: string, approver: { id: string; role: Role }) {
  if (approver.role === Role.HELPER) {
    throw new Error('Helper cannot approve payments.');
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found.`);
    }
    if (payment.status !== PaymentStatus.PENDING_APPROVAL) {
      throw new Error(`Payment is already ${payment.status}.`);
    }

    // Apply the payment now
    return applyPaymentToLedger(tx, {
      receiptNo: payment.receiptNo,
      memberId: payment.memberId,
      kind: payment.kind,
      loanId: payment.loanId ?? undefined,
      amount: new Decimal(payment.amount.toString()),
      method: payment.method,
      paymentDate: payment.paymentDate,
      idempotencyKey: payment.idempotencyKey,
      note: payment.note ?? undefined,
      enteredById: payment.enteredById,
      approvedById: approver.id,
      existingPaymentId: payment.id,
    });
  });
}

/**
 * Internal worker to apply payment, allocations, update records, and post double-entry journal.
 */
async function applyPaymentToLedger(
  tx: Prisma.TransactionClient,
  opts: {
    receiptNo: string;
    memberId: string;
    kind: PaymentKind;
    loanId?: string;
    amount: Decimal;
    method: string;
    paymentDate: Date;
    idempotencyKey: string;
    note?: string;
    enteredById: string;
    approvedById?: string;
    existingPaymentId?: string;
  }
) {
  const { memberId, kind, amount, paymentDate } = opts;

  let journalId: string | null = null;
  const allocationsToCreate: {
    target: AllocTarget;
    dueId?: string;
    fineId?: string;
    interestPeriodId?: string;
    loanId?: string;
    amount: Decimal;
  }[] = [];

  if (kind === PaymentKind.CONTRIBUTION) {
    // 1. Fetch member dues, fines, advance
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { advanceBalance: true },
    });
    if (!member) throw new Error('Member not found');

    const dues = await tx.contributionDue.findMany({
      where: { memberId, status: { in: ['PENDING', 'PARTIAL'] } },
    });

    const fines = await tx.fine.findMany({
      where: { memberId, type: 'CONTRIBUTION', status: { in: ['PENDING', 'PARTIAL'] } },
    });

    const result = allocateContribution(
      amount,
      dues.map((d) => ({
        id: d.id,
        bsYear: d.bsYear,
        bsMonth: d.bsMonth,
        amount: d.amount,
        paidAmount: d.paidAmount,
      })),
      fines.map((f) => ({
        id: f.id,
        amount: f.amount,
        paidAmount: f.paidAmount,
        waivedAmount: f.waivedAmount,
        postedOn: f.postedOn,
      })),
      0 // Not pulling from advance balance during a cash payment, advanceIn is 0
    );

    // Update dues in DB
    for (const alloc of result.allocations) {
      if (alloc.target === 'CONTRIBUTION_DUE' && alloc.dueId) {
        const d = dues.find((item) => item.id === alloc.dueId);
        if (!d) continue;
        const newPaid = new Decimal(d.paidAmount.toString()).plus(alloc.amount);
        const newStatus = newPaid.gte(new Decimal(d.amount.toString())) ? 'PAID' : 'PARTIAL';
        await tx.contributionDue.update({
          where: { id: alloc.dueId },
          data: { paidAmount: newPaid, status: newStatus },
        });
        allocationsToCreate.push({
          target: AllocTarget.CONTRIBUTION_DUE,
          dueId: alloc.dueId,
          amount: alloc.amount,
        });
      } else if (alloc.target === 'CONTRIBUTION_FINE' && alloc.fineId) {
        const f = fines.find((item) => item.id === alloc.fineId);
        if (!f) continue;
        const newPaid = new Decimal(f.paidAmount.toString()).plus(alloc.amount);
        const newStatus = newPaid.gte(new Decimal(f.amount.toString()).minus(new Decimal(f.waivedAmount.toString()))) ? 'PAID' : 'PARTIAL';
        await tx.fine.update({
          where: { id: alloc.fineId },
          data: { paidAmount: newPaid, status: newStatus },
        });
        allocationsToCreate.push({
          target: AllocTarget.CONTRIBUTION_FINE,
          fineId: alloc.fineId,
          amount: alloc.amount,
        });
      } else if (alloc.target === 'ADVANCE') {
        allocationsToCreate.push({
          target: AllocTarget.ADVANCE,
          amount: alloc.amount,
        });
      }
    }

    // Update member advance balance
    if (result.newAdvanceBalance.gt(0)) {
      await tx.member.update({
        where: { id: memberId },
        data: {
          advanceBalance: { increment: result.newAdvanceBalance },
        },
      });
    }

    // Post Double Entry Journal (Section 3.12):
    // Debit 1000 Cash for full amount
    // Credit 2000 Member Deposits (dues + advance)
    // Credit 4100 Fine Income (fines)
    const journalLines: JournalLineInput[] = [
      { accountCode: '1000', debit: amount, memberId },
    ];
    const totalDeposits = result.totalAllocatedToDues.plus(result.newAdvanceBalance);
    if (totalDeposits.gt(0)) {
      journalLines.push({ accountCode: '2000', credit: totalDeposits, memberId });
    }
    if (result.totalAllocatedToFines.gt(0)) {
      journalLines.push({ accountCode: '4100', credit: result.totalAllocatedToFines, memberId });
    }

    const journal = await postJournal(
      {
        date: paymentDate,
        description: `Contribution Payment - Receipt ${opts.receiptNo}`,
        refType: 'PAYMENT',
        createdById: opts.enteredById,
        lines: journalLines,
      },
      tx
    );
    journalId = journal.id;
  } else if (kind === PaymentKind.LOAN) {
    if (!opts.loanId) throw new Error('Loan ID required for loan payment.');

    const loan = await tx.loan.findUnique({
      where: { id: opts.loanId },
      include: {
        periods: true,
      },
    });
    if (!loan) throw new Error('Loan not found.');

    const fines = await tx.fine.findMany({
      where: { memberId, type: 'LOAN_INTEREST', status: { in: ['PENDING', 'PARTIAL'] } },
    });

    const result = allocateLoanPayment(
      amount,
      fines.map((f) => ({
        id: f.id,
        amount: f.amount,
        paidAmount: f.paidAmount,
        waivedAmount: f.waivedAmount,
        postedOn: f.postedOn,
      })),
      loan.periods.map((p) => ({
        id: p.id,
        bsYear: p.bsYear,
        bsMonth: p.bsMonth,
        accrued: p.accrued,
        paid: p.paid,
        capitalised: p.capitalised,
        finalised: p.finalised,
      })),
      0,
      loan.principalOutstanding
    );

    // Apply fine updates
    for (const alloc of result.allocations) {
      if (alloc.target === 'LOAN_FINE' && alloc.fineId) {
        const f = fines.find((item) => item.id === alloc.fineId);
        if (!f) continue;
        const newPaid = new Decimal(f.paidAmount.toString()).plus(alloc.amount);
        const newStatus = newPaid.gte(new Decimal(f.amount.toString()).minus(new Decimal(f.waivedAmount.toString()))) ? 'PAID' : 'PARTIAL';
        await tx.fine.update({
          where: { id: alloc.fineId },
          data: { paidAmount: newPaid, status: newStatus },
        });
        allocationsToCreate.push({
          target: AllocTarget.LOAN_FINE,
          fineId: alloc.fineId,
          amount: alloc.amount,
        });
      } else if (alloc.target === 'LOAN_INTEREST' && alloc.interestPeriodId) {
        const p = loan.periods.find((item) => item.id === alloc.interestPeriodId);
        if (!p) continue;
        const newPaid = new Decimal(p.paid.toString()).plus(alloc.amount);
        await tx.loanInterestPeriod.update({
          where: { id: alloc.interestPeriodId },
          data: { paid: newPaid },
        });
        allocationsToCreate.push({
          target: AllocTarget.LOAN_INTEREST,
          interestPeriodId: alloc.interestPeriodId,
          amount: alloc.amount,
        });
      } else if (alloc.target === 'LOAN_PRINCIPAL') {
        allocationsToCreate.push({
          target: AllocTarget.LOAN_PRINCIPAL,
          loanId: opts.loanId,
          amount: alloc.amount,
        });
      }
    }

    // Update loan principal outstanding
    const newPrincipal = result.remainingPrincipal;
    const isClosed = newPrincipal.isZero();
    await tx.loan.update({
      where: { id: opts.loanId },
      data: {
        principalOutstanding: newPrincipal,
        status: isClosed ? 'CLOSED' : undefined,
        closedOn: isClosed ? paymentDate : undefined,
      },
    });

    if (result.allocatedPrincipal.gt(0)) {
      await tx.loanEvent.create({
        data: {
          loanId: opts.loanId,
          type: 'PRINCIPAL_REPAY',
          amount: result.allocatedPrincipal,
          eventDate: paymentDate,
          principalAfter: newPrincipal,
          reason: `Repayment via receipt ${opts.receiptNo}`,
        },
      });
    }

    // Post double entry journal:
    // Debit 1000 Cash
    // Credit 4100 Fine Income
    // Credit 4000 Loan Interest Income
    // Credit 1200 Loans Receivable
    const journalLines: JournalLineInput[] = [{ accountCode: '1000', debit: amount, memberId }];
    if (result.allocatedFines.gt(0)) {
      journalLines.push({ accountCode: '4100', credit: result.allocatedFines, memberId });
    }
    if (result.allocatedInterest.gt(0)) {
      journalLines.push({ accountCode: '4000', credit: result.allocatedInterest, memberId });
    }
    if (result.allocatedPrincipal.gt(0)) {
      journalLines.push({ accountCode: '1200', credit: result.allocatedPrincipal, memberId });
    }

    const journal = await postJournal(
      {
        date: paymentDate,
        description: `Loan Repayment - Receipt ${opts.receiptNo}`,
        refType: 'PAYMENT',
        createdById: opts.enteredById,
        lines: journalLines,
      },
      tx
    );
    journalId = journal.id;
  }

  // Create or update Payment record
  if (opts.existingPaymentId) {
    return tx.payment.update({
      where: { id: opts.existingPaymentId },
      data: {
        status: PaymentStatus.POSTED,
        approvedById: opts.approvedById,
        journalId,
        allocations: {
          create: allocationsToCreate,
        },
      },
      include: { allocations: true },
    });
  } else {
    return tx.payment.create({
      data: {
        receiptNo: opts.receiptNo,
        memberId: opts.memberId,
        kind: opts.kind,
        loanId: opts.loanId,
        amount,
        method: opts.method,
        paymentDate: opts.paymentDate,
        status: PaymentStatus.POSTED,
        idempotencyKey: opts.idempotencyKey,
        note: opts.note,
        enteredById: opts.enteredById,
        approvedById: opts.approvedById,
        journalId,
        allocations: {
          create: allocationsToCreate,
        },
      },
      include: { allocations: true },
    });
  }
}
