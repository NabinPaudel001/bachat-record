'use server';

import { proposeLoan, approveAndDisburseLoan, updatePendingLoan } from '@/server/services/loanService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

export async function proposeLoanAction(params: {
  borrowerId: string;
  amount: number;
  purpose?: string;
  guarantorMemberIds: string[];
}) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER);

  try {
    const loan = await proposeLoan({
      borrowerId: params.borrowerId,
      amount: params.amount,
      purpose: params.purpose,
      guarantorMemberIds: params.guarantorMemberIds,
      proposerUserId: user.id,
    });

    await auditLog({
      userId: user.id,
      action: 'PROPOSE_LOAN',
      entity: 'Loan',
      entityId: loan.id,
      after: { loanNo: loan.loanNo, amount: loan.amount },
    });

    revalidatePath('/loans');
    return { success: true, loanId: loan.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function updateLoanAction(params: {
  loanId: string;
  amount?: number;
  rateAtStart?: number;
  purpose?: string;
}) {
  const admin = await requireRole(Role.ADMIN);

  try {
    const updated = await updatePendingLoan({
      loanId: params.loanId,
      amount: params.amount,
      rateAtStart: params.rateAtStart,
      purpose: params.purpose,
      adminUser: admin,
    });

    await auditLog({
      userId: admin.id,
      action: 'UPDATE_LOAN',
      entity: 'Loan',
      entityId: updated.id,
      after: { amount: updated.amount, rate: updated.rateAtStart, purpose: updated.purpose },
    });

    revalidatePath('/loans');
    revalidatePath(`/loans/${params.loanId}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function approveLoanAction(
  loanIdOrParams:
    | string
    | {
        loanId: string;
        amount?: number;
        rateAtStart?: number;
        purpose?: string;
        disbursementDate?: string;
      }
) {
  const admin = await requireRole(Role.ADMIN);

  try {
    const loanId = typeof loanIdOrParams === 'string' ? loanIdOrParams : loanIdOrParams.loanId;
    const amount = typeof loanIdOrParams === 'object' ? loanIdOrParams.amount : undefined;
    const rateAtStart = typeof loanIdOrParams === 'object' ? loanIdOrParams.rateAtStart : undefined;
    const purpose = typeof loanIdOrParams === 'object' ? loanIdOrParams.purpose : undefined;
    const disbursementDate =
      typeof loanIdOrParams === 'object' && loanIdOrParams.disbursementDate
        ? new Date(loanIdOrParams.disbursementDate)
        : new Date();

    const loan = await approveAndDisburseLoan({
      loanId,
      disbursementDate,
      amount,
      rateAtStart,
      purpose,
      adminUser: admin,
    });

    await auditLog({
      userId: admin.id,
      action: 'APPROVE_DISBURSE_LOAN',
      entity: 'Loan',
      entityId: loan.id,
      after: { status: loan.status, disbursedOn: loan.disbursedOn, amount: loan.amount },
    });

    revalidatePath('/loans');
    revalidatePath(`/loans/${loan.id}`);
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
