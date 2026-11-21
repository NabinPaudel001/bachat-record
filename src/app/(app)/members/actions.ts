'use server';

import { createMember } from '@/server/services/memberService';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role, DueStatus, LoanStatus, FineStatus, FineType } from '@prisma/client';
import { prisma } from '@/server/db';
import { bsFromAd, adFromBs, graceEndOf } from '@/server/engines/bs';
import Decimal from 'decimal.js';
import { z } from 'zod';

const AddMemberSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  phone: z.string().min(5, 'Valid phone is required'),
  altPhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  permanentAddress: z.string().min(2, 'Address is required'),
  currentAddress: z.string().optional(),
  idNumber: z.string().optional(),
  joinDate: z.string(),
  monthlyAmount: z.string().refine((val) => Number(val) > 0, 'Must be positive'),
  nomineeName: z.string().optional(),
  nomineeRelation: z.string().optional(),
  nomineePhone: z.string().optional(),
});

export async function addMemberAction(formData: FormData) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);

  const raw = {
    fullName: formData.get('fullName') as string,
    phone: formData.get('phone') as string,
    altPhone: (formData.get('altPhone') as string) || undefined,
    email: (formData.get('email') as string) || undefined,
    permanentAddress: formData.get('permanentAddress') as string,
    currentAddress: (formData.get('currentAddress') as string) || undefined,
    idNumber: (formData.get('idNumber') as string) || undefined,
    joinDate: formData.get('joinDate') as string,
    monthlyAmount: formData.get('monthlyAmount') as string,
    nomineeName: (formData.get('nomineeName') as string) || undefined,
    nomineeRelation: (formData.get('nomineeRelation') as string) || undefined,
    nomineePhone: (formData.get('nomineePhone') as string) || undefined,
  };

  const parsed = AddMemberSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input data' };
  }

  const joinDate = new Date(parsed.data.joinDate);

  const newMember = await createMember({
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    altPhone: parsed.data.altPhone,
    email: parsed.data.email || null,
    permanentAddress: parsed.data.permanentAddress,
    currentAddress: parsed.data.currentAddress || null,
    idNumber: parsed.data.idNumber || null,
    joinDate,
    monthlyAmount: parsed.data.monthlyAmount,
    nomineeName: parsed.data.nomineeName || null,
    nomineeRelation: parsed.data.nomineeRelation || null,
    nomineePhone: parsed.data.nomineePhone || null,
  });

  await auditLog({
    userId: user.id,
    action: 'CREATE_MEMBER',
    entity: 'Member',
    entityId: newMember.id,
    after: { memberNo: newMember.memberNo, fullName: newMember.fullName },
  });

  revalidatePath('/members');
  return { success: true, memberId: newMember.id };
}

// ── Add Existing Member (with historical data) ──

export async function addExistingMemberAction(data: {
  fullName: string;
  phone: string;
  altPhone?: string;
  email?: string;
  permanentAddress: string;
  currentAddress?: string;
  idNumber?: string;
  dob?: string;
  joinDate: string;
  monthlyAmount: string;
  bankDetails?: string;
  notes?: string;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  nomineeId?: string;
  contributions: Array<{
    bsYear: number;
    bsMonth: number;
    amount: number;
    paidAmount: number;
    status: 'PAID' | 'PENDING' | 'PARTIAL';
  }>;
  loans: Array<{
    loanNo?: string;
    amount: number;
    disbursedOn?: string;
    purpose?: string;
    status: 'ACTIVE' | 'CLOSED';
    principalOutstanding?: number;
    guarantorCodes?: string[];
  }>;
  fines: Array<{
    type: 'CONTRIBUTION' | 'LOAN_INTEREST';
    amount: number;
    paidAmount: number;
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
    postedOn: string;
  }>;
}) {
  const user = await requireRole(Role.ADMIN);

  try {
    const joinDate = new Date(data.joinDate);

    // Create member first (outside transaction to get memberNo)
    const member = await createMember({
      fullName: data.fullName,
      phone: data.phone,
      altPhone: data.altPhone || null,
      email: data.email || null,
      permanentAddress: data.permanentAddress,
      currentAddress: data.currentAddress || null,
      idNumber: data.idNumber || null,
      dob: data.dob ? new Date(data.dob) : null,
      joinDate,
      monthlyAmount: data.monthlyAmount,
      bankDetails: data.bankDetails || null,
      notes: data.notes || null,
      nomineeName: data.nomineeName || null,
      nomineeRelation: data.nomineeRelation || null,
      nomineePhone: data.nomineePhone || null,
      nomineeId: data.nomineeId || null,
    });

    // Create historical records in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Create ContributionDue records
      for (const c of data.contributions) {
        const monthStart = adFromBs(c.bsYear, c.bsMonth, 1);
        const graceEnd = graceEndOf(c.bsYear, c.bsMonth, 15);
        await tx.contributionDue.create({
          data: {
            memberId: member.id,
            bsYear: c.bsYear,
            bsMonth: c.bsMonth,
            amount: new Decimal(c.amount),
            paidAmount: new Decimal(c.paidAmount),
            status: c.status as DueStatus,
            monthStart,
            graceEnd,
          },
        });
      }

      // 2. Create Loan records
      let loanCounter = 1;
      for (const l of data.loans) {
        const loanNo = l.loanNo || `HIST-${String(loanCounter++).padStart(3, '0')}`;
        const loan = await tx.loan.create({
          data: {
            borrowerId: member.id,
            loanNo,
            amount: new Decimal(l.amount),
            principalOutstanding: new Decimal(l.principalOutstanding ?? (l.status === 'CLOSED' ? 0 : l.amount)),
            status: l.status as LoanStatus,
            disbursedOn: l.disbursedOn ? new Date(l.disbursedOn) : joinDate,
            purpose: l.purpose || 'Historical import',
            rateAtStart: new Decimal(12),
          },
        });

        // Create guarantor links for active loans
        if (l.status === 'ACTIVE' && l.guarantorCodes && l.guarantorCodes.length > 0) {
          for (const code of l.guarantorCodes) {
            const guarantor = await tx.member.findFirst({
              where: { memberNo: code.trim() },
              select: { id: true },
            });
            if (guarantor) {
              await tx.loanGuarantor.create({
                data: {
                  loanId: loan.id,
                  memberId: guarantor.id,
                },
              });
            }
          }
        }
      }

      // 3. Create Fine records
      for (const f of data.fines) {
        await tx.fine.create({
          data: {
            memberId: member.id,
            type: f.type as FineType,
            amount: new Decimal(f.amount),
            paidAmount: new Decimal(f.paidAmount),
            waivedAmount: new Decimal(0),
            status: f.status as FineStatus,
            postedOn: new Date(f.postedOn),
          },
        });
      }
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE_EXISTING_MEMBER',
      entity: 'Member',
      entityId: member.id,
      after: {
        memberNo: member.memberNo,
        fullName: member.fullName,
        contributions: data.contributions.length,
        loans: data.loans.length,
        fines: data.fines.length,
      },
    });

    revalidatePath('/members');
    return { success: true, memberId: member.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
