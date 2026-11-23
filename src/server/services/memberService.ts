import { prisma } from '@/server/db';
import { encrypt, decrypt } from '@/server/encryption';
import { bsFromAd } from '@/server/engines/bs';
import { postJournal } from './ledgerService';
import Decimal from 'decimal.js';
import { MemberStatus, Role } from '@prisma/client';

export interface CreateMemberInput {
  fullName: string;
  dob?: Date | null;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  permanentAddress: string;
  currentAddress?: string | null;
  idNumber?: string | null;
  photoPath?: string | null;
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  nomineePhone?: string | null;
  nomineeId?: string | null;
  bankDetails?: string | null;
  joinDate: Date;
  monthlyAmount: Decimal | string | number;
  notes?: string | null;
  previousMemberId?: string | null;
  advanceBalance?: Decimal | string | number | null;
  memberClass?: string | null;
}

export interface ClassRuleItem {
  id: string;
  label: string;
  joinedFrom: Date | null;
  joinedTo: Date | null;
}

let cachedClassRules: ClassRuleItem[] | null = null;
let classRulesExpiry = 0;

export async function getClassRules(): Promise<ClassRuleItem[]> {
  const now = Date.now();
  if (cachedClassRules && now < classRulesExpiry) {
    return cachedClassRules;
  }
  try {
    cachedClassRules = await prisma.classRule.findMany();
    classRulesExpiry = now + 10 * 60 * 1000; // 10 minutes in-memory cache
  } catch (err) {
    if (cachedClassRules) return cachedClassRules;
    return [];
  }
  return cachedClassRules;
}

/**
 * Pure synchronous evaluation of member class using given rules list.
 */
export function evaluateMemberClass(
  joinDate: Date,
  notes?: string | null,
  rules?: ClassRuleItem[]
): string {
  if (notes) {
    const match =
      notes.match(/\[Class:\s*([A-D])\]/i) ||
      notes.match(/^Class\s*([A-D])/i) ||
      notes.match(/Class:\s*([A-D])/i);
    if (match) {
      return `Class ${match[1].toUpperCase()}`;
    }
  }
  if (rules && rules.length > 0) {
    for (const r of rules) {
      const fromOk = !r.joinedFrom || joinDate >= r.joinedFrom;
      const toOk = !r.joinedTo || joinDate <= r.joinedTo;
      if (fromOk && toOk) {
        return r.label.startsWith('Class ') ? r.label : `Class ${r.label}`;
      }
    }
  }
  return 'Class D';
}

/**
 * Determine the class (A, B, C, D) from notes tag [Class: X] or member join date using cached ClassRule table.
 */
export async function determineMemberClass(joinDate: Date, notes?: string | null): Promise<string> {
  if (notes) {
    const match =
      notes.match(/\[Class:\s*([A-D])\]/i) ||
      notes.match(/^Class\s*([A-D])/i) ||
      notes.match(/Class:\s*([A-D])/i);
    if (match) {
      return `Class ${match[1].toUpperCase()}`;
    }
  }
  const rules = await getClassRules();
  return evaluateMemberClass(joinDate, notes, rules);
}

/**
 * Generate next member number based on member class (e.g., A-0000, B-0000, C-0000, D-0000).
 * 4 digits zero-padded starting from 0000 (A-0000, A-0001, etc.).
 */
export async function generateNextMemberNo(memberClassInput?: string | null): Promise<string> {
  let prefix = 'D';
  if (memberClassInput) {
    const clean = memberClassInput.replace(/^Class\s*/i, '').trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(clean)) {
      prefix = clean;
    }
  }

  // Find the highest sequence number for this class prefix
  const members = await prisma.member.findMany({
    where: {
      memberNo: { startsWith: `${prefix}-` },
    },
    select: { memberNo: true },
  });

  let maxNum = -1;
  for (const m of members) {
    const numPart = parseInt(m.memberNo.replace(`${prefix}-`, ''), 10);
    if (!isNaN(numPart) && numPart > maxNum) {
      maxNum = numPart;
    }
  }

  const nextNum = maxNum + 1;
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

/**
 * Create a new member.
 */
export async function createMember(input: CreateMemberInput) {
  // Determine class for member number generation
  let targetClass = input.memberClass ? input.memberClass.replace(/^Class\s*/i, '').trim().toUpperCase() : null;
  if (!targetClass) {
    targetClass = (await determineMemberClass(input.joinDate, input.notes)).replace(/^Class\s*/i, '').trim().toUpperCase();
  }

  const memberNo = await generateNextMemberNo(targetClass);
  const bs = bsFromAd(input.joinDate);

  const idNumberEnc = input.idNumber ? encrypt(input.idNumber) : null;
  const nomineeIdEnc = input.nomineeId ? encrypt(input.nomineeId) : null;

  let notes = input.notes || null;
  if (targetClass) {
    const classTag = `[Class: ${targetClass}]`;
    notes = notes ? `${classTag}\n${notes}` : classTag;
  }

  return prisma.member.create({
    data: {
      memberNo,
      fullName: input.fullName,
      dob: input.dob,
      phone: input.phone,
      altPhone: input.altPhone,
      email: input.email,
      permanentAddress: input.permanentAddress,
      currentAddress: input.currentAddress,
      idNumberEnc,
      photoPath: input.photoPath,
      nomineeName: input.nomineeName,
      nomineeRelation: input.nomineeRelation,
      nomineePhone: input.nomineePhone,
      nomineeIdEnc,
      bankDetails: input.bankDetails,
      joinDate: input.joinDate,
      joinBsYear: bs.year,
      joinBsMonth: bs.month,
      monthlyAmount: new Decimal(input.monthlyAmount.toString()),
      advanceBalance: input.advanceBalance ? new Decimal(input.advanceBalance.toString()) : new Decimal(0),
      notes,
      previousMemberId: input.previousMemberId,
      status: MemberStatus.ACTIVE,
    },
  });
}

/**
 * Get member profile with decrypted sensitive fields (role check enforced).
 */
export async function getMemberProfile(memberId: string, userRole: Role) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      dues: { orderBy: [{ bsYear: 'desc' }, { bsMonth: 'desc' }] },
      fines: { orderBy: { postedOn: 'desc' } },
      loans: {
        include: {
          guarantors: { include: { member: { select: { id: true, memberNo: true, fullName: true } } } },
          periods: true,
          events: true,
        },
      },
      guarantees: {
        include: {
          loan: {
            include: { borrower: { select: { id: true, memberNo: true, fullName: true } } },
          },
        },
      },
      documents: true,
    },
  });

  if (!member) return null;

  // Class derivation
  const memberClass = await determineMemberClass(member.joinDate, member.notes);

  // Decrypt ID numbers only for ADMIN and TREASURER
  let idNumber: string | null = null;
  let nomineeId: string | null = null;

  if (userRole === Role.ADMIN || userRole === Role.TREASURER) {
    if (member.idNumberEnc) {
      try {
        idNumber = decrypt(member.idNumberEnc);
      } catch {
        idNumber = '[Decryption failed]';
      }
    }
    if (member.nomineeIdEnc) {
      try {
        nomineeId = decrypt(member.nomineeIdEnc);
      } catch {
        nomineeId = '[Decryption failed]';
      }
    }
  }

  // Calculate totals
  let totalDeposited = new Decimal(0);
  let pendingContribution = new Decimal(0);
  for (const d of member.dues) {
    totalDeposited = totalDeposited.plus(new Decimal(d.paidAmount.toString()));
    if (d.status !== 'PAID') {
      pendingContribution = pendingContribution.plus(
        new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()))
      );
    }
  }

  let pendingFinesContribution = new Decimal(0);
  let pendingFinesLoan = new Decimal(0);
  for (const f of member.fines) {
    const unp = new Decimal(f.amount.toString())
      .minus(new Decimal(f.paidAmount.toString()))
      .minus(new Decimal(f.waivedAmount.toString()));
    if (unp.gt(0)) {
      if (f.type === 'CONTRIBUTION') {
        pendingFinesContribution = pendingFinesContribution.plus(unp);
      } else {
        pendingFinesLoan = pendingFinesLoan.plus(unp);
      }
    }
  }

  let totalLoanPrincipal = new Decimal(0);
  for (const l of member.loans) {
    if (l.status === 'ACTIVE') {
      totalLoanPrincipal = totalLoanPrincipal.plus(new Decimal(l.principalOutstanding.toString()));
    }
  }

  return {
    ...member,
    idNumber,
    nomineeId,
    memberClass,
    totalDeposited,
    pendingContribution,
    pendingFinesContribution,
    pendingFinesLoan,
    totalLoanPrincipal,
  };
}

/**
 * Close Member Account / Exit (Section 3.14).
 * Admin only.
 */
export async function closeMemberAccount(params: {
  memberId: string;
  exitDate: Date;
  closeReason: string;
  waiveRemainingFines?: boolean;
  adminUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: params.memberId },
      include: {
        loans: { where: { status: 'ACTIVE' } },
        guarantees: {
          include: { loan: true },
          where: { replacedOn: null },
        },
      },
    });

    if (!member) throw new Error('Member not found');
    if (member.status === MemberStatus.CLOSED) {
      throw new Error('Member is already closed.');
    }

    // 1. Blocked if outstanding loan
    if (member.loans.length > 0) {
      const activeLoanNos = member.loans.map((l) => l.loanNo).join(', ');
      throw new Error(`Cannot close account: Member has active loans (${activeLoanNos}). Loans must be fully paid and closed first.`);
    }

    // 2. Blocked if guarantor on active loan (unless replaced)
    const activeGuarantees = member.guarantees.filter((g) => g.loan.status === 'ACTIVE');
    if (activeGuarantees.length > 0) {
      const activeLoanNos = activeGuarantees.map((g) => g.loan.loanNo).join(', ');
      throw new Error(
        `Cannot close account: Member is a guarantor for active loan(s): ${activeLoanNos}. Replace the guarantor on those loans first.`
      );
    }

    // 3. Waive fines if requested
    if (params.waiveRemainingFines) {
      await tx.fine.updateMany({
        where: {
          memberId: params.memberId,
          status: { in: ['PENDING', 'PARTIAL'] },
        },
        data: {
          status: 'WAIVED',
          waivedAmount: 999999, // marked fully waived
          waiveReason: 'Account closure waiver',
          waivedById: params.adminUserId,
        },
      });
    }

    // 4. Calculate total deposits to pay out
    const paidDues = await tx.contributionDue.aggregate({
      where: { memberId: params.memberId },
      _sum: { paidAmount: true },
    });
    const depositSum = new Decimal(paidDues._sum.paidAmount?.toString() ?? 0).plus(
      new Decimal(member.advanceBalance.toString())
    );

    // 5. Post payout journal if deposits > 0
    if (depositSum.gt(0)) {
      await postJournal(
        {
          date: params.exitDate,
          description: `Account Closure Payout - Member ${member.memberNo} (${member.fullName})`,
          refType: 'MEMBER_EXIT',
          refId: member.id,
          createdById: params.adminUserId,
          lines: [
            { accountCode: '2000', debit: depositSum, memberId: member.id },
            { accountCode: '1000', credit: depositSum, memberId: member.id },
          ],
        },
        tx
      );
    }

    // 6. Set status to CLOSED
    return tx.member.update({
      where: { id: params.memberId },
      data: {
        status: MemberStatus.CLOSED,
        closedOn: params.exitDate,
        closeReason: params.closeReason,
        advanceBalance: new Decimal(0),
      },
    });
  });
}
