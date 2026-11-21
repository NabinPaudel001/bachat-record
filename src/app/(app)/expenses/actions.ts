'use server';

import { recordExpense, recordOtherIncome } from '@/server/services/portfolioService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

export async function recordExpenseAction(formData: FormData) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER);

  const dateStr = formData.get('date') as string;
  const amount = Number(formData.get('amount'));
  const payee = formData.get('payee') as string;
  const note = formData.get('note') as string;

  if (!amount || amount <= 0) return { error: 'Invalid amount' };

  try {
    const exp = await recordExpense({
      date: new Date(dateStr),
      amount,
      payee,
      note,
      userId: user.id,
    });

    await auditLog({
      userId: user.id,
      action: 'RECORD_EXPENSE',
      entity: 'Expense',
      entityId: exp.id,
      after: { amount: exp.amount, payee: exp.payee },
    });

    revalidatePath('/expenses');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function recordIncomeAction(formData: FormData) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER);

  const dateStr = formData.get('date') as string;
  const amount = Number(formData.get('amount'));
  const source = formData.get('source') as string;
  const note = formData.get('note') as string;

  if (!amount || amount <= 0) return { error: 'Invalid amount' };

  try {
    const inc = await recordOtherIncome({
      date: new Date(dateStr),
      amount,
      source,
      note,
      userId: user.id,
    });

    await auditLog({
      userId: user.id,
      action: 'RECORD_OTHER_INCOME',
      entity: 'OtherIncome',
      entityId: inc.id,
      after: { amount: inc.amount, source: inc.source },
    });

    revalidatePath('/expenses');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
