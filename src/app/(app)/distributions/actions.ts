'use server';

import { confirmDistribution } from '@/server/services/distributionService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { DistType, PayoutPeriod, PayoutMode, Role } from '@prisma/client';

export async function confirmDistributionAction(params: {
  type: 'INTEREST' | 'BONUS';
  period: 'ANNUAL' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'MONTHLY';
  fromDate: string;
  toDate: string;
  totalAmount: number;
  payoutMode: 'PAYABLE' | 'REINVEST';
}) {
  const admin = await requireRole(Role.ADMIN);

  try {
    const dist = await confirmDistribution({
      type: params.type as DistType,
      period: params.period as PayoutPeriod,
      fromDate: new Date(params.fromDate),
      toDate: new Date(params.toDate),
      totalAmount: params.totalAmount,
      includeUnpaid: true,
      payoutMode: params.payoutMode as PayoutMode,
      userId: admin.id,
    });

    await auditLog({
      userId: admin.id,
      action: 'CONFIRM_DISTRIBUTION',
      entity: 'Distribution',
      entityId: dist.id,
      after: { type: dist.type, totalAmount: dist.totalAmount, status: dist.status },
    });

    revalidatePath('/distributions');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    revalidatePath('/reports');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
