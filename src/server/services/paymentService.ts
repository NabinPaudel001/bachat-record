import { prisma } from '@/server/db';
import { allocateMemberPayment, PaymentType } from '@/server/engines/paymentAllocation';
import { syncAllFinancials } from './syncService';
import { postJournal, JournalLineInput } from './ledgerService';
import { getSetting } from '@/server/settings';
import Decimal from 'decimal.js';
import { PaymentKind, PaymentStatus, Role, AllocTarget, Prisma } from '@prisma/client';

export interface RecordPaymentParams {
  memberId: string;
  kind?: PaymentKind;
  paymentType?: PaymentType;
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
 * Record a payment (Automatic or specific Payment Type).
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

  // Derive paymentType and PaymentKind
  const paymentType: PaymentType = params.paymentType || (params.kind === PaymentKind.LOAN ? 'LOAN_PRINCIPAL' : 'MONTHLY_LEVY_CONTRIBUTION');
  const kind: PaymentKind = (
    paymentType === 'LOAN_INTEREST' ||
    paymentType === 'LOAN_FINE' ||
    paymentType === 'LOAN_PRINCIPAL' ||
    (paymentType === 'AUTOMATIC' && Boolean(params.loanId))
  ) ? PaymentKind.LOAN : PaymentKind.CONTRIBUTION;

  // 2. Maker-checker check: if user is HELPER and setting is enabled
  const helperNeedsApproval = Boolean(await getSetting('helperPaymentsNeedApproval'));
  const isHelper = params.user.role === Role.HELPER;
  const status: PaymentStatus = isHelper && helperNeedsApproval
    ? PaymentStatus.PENDING_APPROVAL
    : PaymentStatus.POSTED;

  // Auto-sync financials so 2083 dues and live daily loan interest periods exist to receive allocation
  await syncAllFinancials();

  // 3. Process inside a transaction with 30s timeout to prevent transaction expiration on remote DB
  return prisma.$transaction(
    async (tx) => {
      // If pending approval, we only save the payment record without applying allocations or journal
      if (status === PaymentStatus.PENDING_APPROVAL) {
        return tx.payment.create({
          data: {
            receiptNo: params.receiptNo,
            memberId: params.memberId,
            kind,
            loanId: params.loanId,
            amount,
            method: params.method,
            paymentDate: params.paymentDate,
            status: PaymentStatus.PENDING_APPROVAL,
            idempotencyKey: params.idempotencyKey,
            note: params.note ? `[${paymentType}] ${params.note}` : `[${paymentType}]`,
            enteredById: params.user.id,
          },
        });
      }

      // Otherwise, apply immediately
      return applyPaymentToLedger(tx, {
        receiptNo: params.receiptNo,
        memberId: params.memberId,
        kind,
        paymentType,
        loanId: params.loanId,
        amount,
        method: params.method,
        paymentDate: params.paymentDate,
        idempotencyKey: params.idempotencyKey,
        note: params.note,
        enteredById: params.user.id,
        approvedById: params.user.id,
      });
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

/**
 * Approve a pending Helper payment (Admin or Treasurer only).
 */
export async function approvePayment(paymentId: string, approver: { id: string; role: Role }) {
  if (approver.role === Role.HELPER) {
    throw new Error('Helper cannot approve payments.');
  }

  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        throw new Error(`Payment ${paymentId} not found.`);
      }
      if (payment.status !== PaymentStatus.PENDING_APPROVAL) {
        throw new Error(`Payment is already ${payment.status}.`);
      }

      // Parse paymentType from note if available
      let paymentType: PaymentType = 'AUTOMATIC';
      if (payment.note?.includes('[MONTHLY_LEVY_CONTRIBUTION]')) paymentType = 'MONTHLY_LEVY_CONTRIBUTION';
      else if (payment.note?.includes('[MONTHLY_LEVY_FINE]')) paymentType = 'MONTHLY_LEVY_FINE';
      else if (payment.note?.includes('[LOAN_INTEREST]')) paymentType = 'LOAN_INTEREST';
      else if (payment.note?.includes('[LOAN_FINE]')) paymentType = 'LOAN_FINE';
      else if (payment.note?.includes('[LOAN_PRINCIPAL]')) paymentType = 'LOAN_PRINCIPAL';
      else if (payment.kind === PaymentKind.CONTRIBUTION) paymentType = 'MONTHLY_LEVY_CONTRIBUTION';
      else if (payment.kind === PaymentKind.LOAN) paymentType = 'LOAN_PRINCIPAL';

      // Apply the payment now
      return applyPaymentToLedger(tx, {
        receiptNo: payment.receiptNo,
        memberId: payment.memberId,
        kind: payment.kind,
        paymentType,
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
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

/**
 * Internal worker to apply payment, allocations, update records, and post double-entry journal.
 * All DB writes are batched into parallel groups to minimise round-trips and avoid transaction timeout.
 */
async function applyPaymentToLedger(
  tx: Prisma.TransactionClient,
  opts: {
    receiptNo: string;
    memberId: string;
    kind: PaymentKind;
    paymentType?: PaymentType;
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
  const { memberId, amount, paymentDate } = opts;
  const paymentType: PaymentType = opts.paymentType || (opts.kind === PaymentKind.LOAN ? 'LOAN_PRINCIPAL' : 'MONTHLY_LEVY_CONTRIBUTION');

  // 1. Fetch member dues, fines, and active loans in parallel to minimize latency round-trips
  const [member, dues, fines, loans] = await Promise.all([
    tx.member.findUnique({
      where: { id: memberId },
      select: { id: true, advanceBalance: true },
    }),
    tx.contributionDue.findMany({
      where: { memberId, status: { in: ['PENDING', 'PARTIAL'] } },
      orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
    }),
    tx.fine.findMany({
      where: { memberId, status: { in: ['PENDING', 'PARTIAL'] } },
      orderBy: { postedOn: 'asc' },
    }),
    tx.loan.findMany({
      where: { borrowerId: memberId, status: 'ACTIVE' },
      include: {
        periods: {
          orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
        },
      },
    }),
  ]);

  if (!member) throw new Error('Member not found');

  // 2. Perform allocation via paymentAllocation engine (pure computation, no DB)
  const allocResult = allocateMemberPayment({
    amount,
    paymentType,
    dues: dues.map((d) => ({
      id: d.id,
      bsYear: d.bsYear,
      bsMonth: d.bsMonth,
      amount: d.amount,
      paidAmount: d.paidAmount,
      status: d.status,
    })),
    fines: fines.map((f) => ({
      id: f.id,
      type: f.type,
      amount: f.amount,
      paidAmount: f.paidAmount,
      waivedAmount: f.waivedAmount,
      postedOn: f.postedOn,
      status: f.status,
    })),
    loans: loans.map((l) => ({
      id: l.id,
      loanNo: l.loanNo,
      principalOutstanding: l.principalOutstanding,
      periods: l.periods.map((p) => ({
        id: p.id,
        bsYear: p.bsYear,
        bsMonth: p.bsMonth,
        accrued: p.accrued,
        paid: p.paid,
        capitalised: p.capitalised,
      })),
    })),
    selectedLoanId: opts.loanId,
  });

  const allocationsToCreate: {
    target: AllocTarget;
    dueId?: string;
    fineId?: string;
    interestPeriodId?: string;
    loanId?: string;
    amount: Decimal;
  }[] = [];

  // 3. Build all DB write promises up-front, then execute in a single parallel batch.
  //    This avoids sequential awaits that accumulate latency and cause "Transaction not found".
  const writePromises: Promise<unknown>[] = [];

  for (const alloc of allocResult.allocations) {
    if (alloc.target === 'CONTRIBUTION_DUE' && alloc.dueId) {
      const d = dues.find((item) => item.id === alloc.dueId);
      if (d) {
        const newPaid = new Decimal(d.paidAmount.toString()).plus(alloc.amount);
        const newStatus = newPaid.gte(new Decimal(d.amount.toString())) ? 'PAID' : 'PARTIAL';
        writePromises.push(
          tx.contributionDue.update({
            where: { id: alloc.dueId },
            data: { paidAmount: newPaid, status: newStatus },
          })
        );
        allocationsToCreate.push({
          target: AllocTarget.CONTRIBUTION_DUE,
          dueId: alloc.dueId,
          amount: alloc.amount,
        });
      }
    } else if ((alloc.target === 'CONTRIBUTION_FINE' || alloc.target === 'LOAN_FINE') && alloc.fineId) {
      const f = fines.find((item) => item.id === alloc.fineId);
      if (f) {
        const newPaid = new Decimal(f.paidAmount.toString()).plus(alloc.amount);
        const newStatus = newPaid.gte(new Decimal(f.amount.toString()).minus(new Decimal(f.waivedAmount.toString()))) ? 'PAID' : 'PARTIAL';
        writePromises.push(
          tx.fine.update({
            where: { id: alloc.fineId },
            data: { paidAmount: newPaid, status: newStatus },
          })
        );
        allocationsToCreate.push({
          target: alloc.target === 'CONTRIBUTION_FINE' ? AllocTarget.CONTRIBUTION_FINE : AllocTarget.LOAN_FINE,
          fineId: alloc.fineId,
          amount: alloc.amount,
        });
      }
    } else if (alloc.target === 'LOAN_INTEREST' && alloc.interestPeriodId) {
      let matchedPeriod = null;
      for (const l of loans) {
        const p = l.periods.find((period) => period.id === alloc.interestPeriodId);
        if (p) {
          matchedPeriod = p;
          break;
        }
      }
      if (matchedPeriod) {
        const newPaid = new Decimal(matchedPeriod.paid.toString()).plus(alloc.amount);
        writePromises.push(
          tx.loanInterestPeriod.update({
            where: { id: alloc.interestPeriodId },
            data: { paid: newPaid },
          })
        );
        allocationsToCreate.push({
          target: AllocTarget.LOAN_INTEREST,
          interestPeriodId: alloc.interestPeriodId,
          amount: alloc.amount,
        });
      }
    } else if (alloc.target === 'LOAN_PRINCIPAL' && alloc.loanId) {
      const loan = loans.find((l) => l.id === alloc.loanId);
      if (loan) {
        const newPrincipal = Decimal.max(0, new Decimal(loan.principalOutstanding.toString()).minus(alloc.amount));
        const isClosed = newPrincipal.isZero();
        writePromises.push(
          tx.loan.update({
            where: { id: alloc.loanId },
            data: {
              principalOutstanding: newPrincipal,
              status: isClosed ? 'CLOSED' : undefined,
              closedOn: isClosed ? paymentDate : undefined,
            },
          })
        );
        writePromises.push(
          tx.loanEvent.create({
            data: {
              loanId: alloc.loanId,
              type: 'PRINCIPAL_REPAY',
              amount: alloc.amount,
              eventDate: paymentDate,
              principalAfter: newPrincipal,
              reason: `Repayment via receipt ${opts.receiptNo}`,
            },
          })
        );
        allocationsToCreate.push({
          target: AllocTarget.LOAN_PRINCIPAL,
          loanId: alloc.loanId,
          amount: alloc.amount,
        });
      }
    } else if (alloc.target === 'ADVANCE') {
      allocationsToCreate.push({
        target: AllocTarget.ADVANCE,
        amount: alloc.amount,
      });
      writePromises.push(
        tx.member.update({
          where: { id: memberId },
          data: {
            advanceBalance: { increment: alloc.amount },
          },
        })
      );
    }
  }

  // Execute all allocation writes in parallel to minimise transaction wall-clock time
  if (writePromises.length > 0) {
    await Promise.all(writePromises);
  }

  // 4. Post Double-Entry Journal:
  // Debit 1000 Cash for amount
  // Credit 4100 Fine Income for totalLoanFine + totalLevyFine
  // Credit 4000 Loan Interest Income for totalInterest
  // Credit 1200 Loans Receivable for totalPrincipal
  // Credit 2000 Member Deposits for totalDues + totalAdvance
  const journalLines: JournalLineInput[] = [
    { accountCode: '1000', debit: amount, memberId },
  ];

  const totalFines = allocResult.totalLoanFine.plus(allocResult.totalLevyFine);
  if (totalFines.gt(0)) {
    journalLines.push({ accountCode: '4100', credit: totalFines, memberId });
  }

  if (allocResult.totalInterest.gt(0)) {
    journalLines.push({ accountCode: '4000', credit: allocResult.totalInterest, memberId });
  }

  if (allocResult.totalPrincipal.gt(0)) {
    journalLines.push({ accountCode: '1200', credit: allocResult.totalPrincipal, memberId });
  }

  const totalDeposits = allocResult.totalDues.plus(allocResult.totalAdvance);
  if (totalDeposits.gt(0)) {
    journalLines.push({ accountCode: '2000', credit: totalDeposits, memberId });
  }

  const journal = await postJournal(
    {
      date: paymentDate,
      description: `Payment [${paymentType}] - Receipt ${opts.receiptNo}`,
      refType: 'PAYMENT',
      createdById: opts.enteredById,
      lines: journalLines,
    },
    tx
  );

  const formattedNote = opts.note ? `[${paymentType}] ${opts.note}` : `[${paymentType}]`;

  // 5. Create or update Payment record
  if (opts.existingPaymentId) {
    return tx.payment.update({
      where: { id: opts.existingPaymentId },
      data: {
        status: PaymentStatus.POSTED,
        approvedById: opts.approvedById,
        journalId: journal.id,
        note: formattedNote,
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
        note: formattedNote,
        enteredById: opts.enteredById,
        approvedById: opts.approvedById,
        journalId: journal.id,
        allocations: {
          create: allocationsToCreate,
        },
      },
      include: { allocations: true },
    });
  }
}
