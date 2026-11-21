'use server';

import { closeMemberAccount } from '@/server/services/memberService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';
import { prisma } from '@/server/db';
import { encrypt } from '@/server/encryption';
import { bsFromAd } from '@/server/engines/bs';
import Decimal from 'decimal.js';

export async function closeMemberAccountAction(formData: FormData) {
  const admin = await requireRole(Role.ADMIN);

  const memberId = formData.get('memberId') as string;
  const exitDateStr = formData.get('exitDate') as string;
  const closeReason = formData.get('closeReason') as string;
  const waiveRemainingFines = formData.get('waiveFines') === 'true';

  if (!memberId || !exitDateStr || !closeReason) {
    return { error: 'All fields are required.' };
  }

  try {
    const closed = await closeMemberAccount({
      memberId,
      exitDate: new Date(exitDateStr),
      closeReason,
      waiveRemainingFines,
      adminUserId: admin.id,
    });

    await auditLog({
      userId: admin.id,
      action: 'CLOSE_MEMBER_ACCOUNT',
      entity: 'Member',
      entityId: closed.id,
      after: { closedOn: closed.closedOn, reason: closed.closeReason },
    });

    revalidatePath(`/members/${memberId}`);
    revalidatePath('/members');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function updateMemberAction(data: {
  memberId: string;
  fullName: string;
  phone: string;
  altPhone?: string;
  email?: string;
  permanentAddress: string;
  currentAddress?: string;
  bankDetails?: string;
  notes?: string;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  monthlyAmount: string;
  dob?: string;
  idNumber?: string;
}) {
  const admin = await requireRole(Role.ADMIN);

  if (!data.memberId || !data.fullName || !data.phone || !data.permanentAddress) {
    return { error: 'Required fields are missing.' };
  }

  try {
    const idNumberEnc = data.idNumber ? encrypt(data.idNumber) : undefined;
    const dob = data.dob ? new Date(data.dob) : null;

    const updated = await prisma.member.update({
      where: { id: data.memberId },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        altPhone: data.altPhone || null,
        email: data.email || null,
        permanentAddress: data.permanentAddress,
        currentAddress: data.currentAddress || null,
        bankDetails: data.bankDetails || null,
        notes: data.notes || null,
        nomineeName: data.nomineeName || null,
        nomineeRelation: data.nomineeRelation || null,
        nomineePhone: data.nomineePhone || null,
        monthlyAmount: new Decimal(data.monthlyAmount),
        dob,
        ...(idNumberEnc !== undefined ? { idNumberEnc } : {}),
      },
    });

    await auditLog({
      userId: admin.id,
      action: 'UPDATE_MEMBER',
      entity: 'Member',
      entityId: updated.id,
      after: {
        fullName: updated.fullName,
        phone: updated.phone,
        permanentAddress: updated.permanentAddress,
      },
    });

    revalidatePath(`/members/${data.memberId}`);
    revalidatePath('/members');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
