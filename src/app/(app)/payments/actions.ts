'use server';

import { recordPayment } from '@/server/services/paymentService';
import { PaymentType } from '@/server/engines/paymentAllocation';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { PaymentKind, Role } from '@prisma/client';

export async function recordPaymentAction(params: {
  memberId: string;
  kind?: 'CONTRIBUTION' | 'LOAN';
  paymentType?: PaymentType;
  loanId?: string;
  amount: number;
  method: string;
  paymentDate: string;
  receiptNo: string;
  idempotencyKey: string;
  note?: string;
}) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);

  try {
    const payment = await recordPayment({
      memberId: params.memberId,
      kind: params.kind as PaymentKind,
      paymentType: params.paymentType,
      loanId: params.loanId,
      amount: params.amount,
      method: params.method,
      paymentDate: new Date(params.paymentDate),
      receiptNo: params.receiptNo,
      idempotencyKey: params.idempotencyKey,
      note: params.note,
      user,
    });

    await auditLog({
      userId: user.id,
      action: 'RECORD_PAYMENT',
      entity: 'Payment',
      entityId: payment.id,
      after: { receiptNo: payment.receiptNo, amount: payment.amount, status: payment.status },
    });

    revalidatePath('/payments');
    revalidatePath('/register');
    revalidatePath('/pending');
    revalidatePath(`/members/${params.memberId}`);
    revalidatePath('/dashboard');

    return { success: true, paymentId: payment.id, status: payment.status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
