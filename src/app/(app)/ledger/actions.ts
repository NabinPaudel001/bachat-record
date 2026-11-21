'use server';

import { reverseJournal } from '@/server/services/ledgerService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

export async function reverseJournalAction(params: {
  journalId: string;
  reason: string;
}) {
  const admin = await requireRole(Role.ADMIN);

  try {
    const rev = await reverseJournal(params.journalId, params.reason, admin.id);

    await auditLog({
      userId: admin.id,
      action: 'REVERSE_JOURNAL',
      entity: 'Journal',
      entityId: params.journalId,
      after: { reversalJournalId: rev.id, reason: params.reason },
    });

    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    revalidatePath('/reports');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
