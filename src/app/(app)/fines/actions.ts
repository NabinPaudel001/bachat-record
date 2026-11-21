'use server';

import { waiveFine } from '@/server/services/loanService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

export async function waiveFineAction(params: {
  fineId: string;
  waiveAmount?: number;
  reason: string;
}) {
  const admin = await requireRole(Role.ADMIN);

  try {
    const updated = await waiveFine({
      fineId: params.fineId,
      waiveAmount: params.waiveAmount,
      reason: params.reason,
      adminUser: admin,
    });

    await auditLog({
      userId: admin.id,
      action: 'WAIVE_FINE',
      entity: 'Fine',
      entityId: params.fineId,
      after: {
        waivedAmount: updated.waivedAmount,
        status: updated.status,
        reason: params.reason,
      },
    });

    revalidatePath('/fines');
    revalidatePath('/pending');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
