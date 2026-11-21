'use server';

import { convertInterestToPrincipal } from '@/server/services/loanService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

export async function capitaliseInterestAction(params: {
  loanId: string;
  amount: number;
  reason: string;
}) {
  const admin = await requireRole(Role.ADMIN);

  try {
    const updatedLoan = await convertInterestToPrincipal({
      loanId: params.loanId,
      amount: params.amount,
      reason: params.reason,
      adminUser: admin,
    });

    await auditLog({
      userId: admin.id,
      action: 'CAPITALISE_LOAN_INTEREST',
      entity: 'Loan',
      entityId: params.loanId,
      after: {
        principalOutstanding: updatedLoan.principalOutstanding,
        capitalisedAmount: params.amount,
        reason: params.reason,
      },
    });

    revalidatePath(`/loans/${params.loanId}`);
    revalidatePath('/loans');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
