'use server';

import { proposeLoan, approveAndDisburseLoan } from '@/server/services/loanService';
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

export async function approveLoanAction(loanId: string) {
  const admin = await requireRole(Role.ADMIN);

  const loan = await approveAndDisburseLoan({
    loanId,
    disbursementDate: new Date(),
    adminUser: admin,
  });

  await auditLog({
    userId: admin.id,
    action: 'APPROVE_DISBURSE_LOAN',
    entity: 'Loan',
    entityId: loan.id,
    after: { status: loan.status, disbursedOn: loan.disbursedOn },
  });

  revalidatePath('/loans');
  revalidatePath('/ledger');
  revalidatePath('/dashboard');
  return { success: true };
}
