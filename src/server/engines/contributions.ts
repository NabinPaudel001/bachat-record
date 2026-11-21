import Decimal from 'decimal.js';
import { bsMonthRange, graceEndOf } from './bs';

export interface MemberDueSeed {
  id: string;
  joinBsYear: number;
  joinBsMonth: number;
  monthlyAmount: Decimal | string | number;
}

export interface ContributionDueItem {
  id?: string;
  memberId: string;
  bsYear: number;
  bsMonth: number;
  monthStart: Date;
  graceEnd: Date;
  amount: Decimal;
  paidAmount: Decimal;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
}

export interface FineItem {
  id?: string;
  memberId: string;
  type: 'CONTRIBUTION' | 'LOAN_INTEREST';
  amount: Decimal;
  paidAmount: Decimal;
  waivedAmount: Decimal;
  postedOn: Date;
  contributionDueId?: string | null;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
}

export interface ContributionAllocation {
  target: 'CONTRIBUTION_DUE' | 'CONTRIBUTION_FINE' | 'ADVANCE';
  dueId?: string;
  fineId?: string;
  amount: Decimal;
  bsYear?: number;
  bsMonth?: number;
}

export interface AllocationResult {
  allocations: ContributionAllocation[];
  remainingAmount: Decimal;
  newAdvanceBalance: Decimal;
  totalAllocatedToDues: Decimal;
  totalAllocatedToFines: Decimal;
}

/**
 * Generate all expected contribution dues for a member up to a target BS year and month.
 */
export function generateDues(
  member: MemberDueSeed,
  upToYear: number,
  upToMonth: number,
  graceDay: number = 10
): ContributionDueItem[] {
  const dues: ContributionDueItem[] = [];
  let y = member.joinBsYear;
  let m = member.joinBsMonth;
  const monthly = new Decimal(member.monthlyAmount.toString());

  while (y < upToYear || (y === upToYear && m <= upToMonth)) {
    const { start } = bsMonthRange(y, m);
    const graceEnd = graceEndOf(y, m, graceDay);

    dues.push({
      memberId: member.id,
      bsYear: y,
      bsMonth: m,
      monthStart: start,
      graceEnd,
      amount: monthly,
      paidAmount: new Decimal(0),
      status: 'PENDING',
    });

    m++;
    if (m > 12) {
      y++;
      m = 1;
    }
  }

  return dues;
}

/**
 * Check if a due qualifies for a late contribution fine.
 * Rule: BS month M due is late if not fully paid by the end of day 10 of month M+1 (graceEnd).
 */
export function fineDue(
  due: {
    id: string;
    memberId: string;
    amount: Decimal | string | number;
    paidAmount: Decimal | string | number;
    graceEnd: Date;
  },
  today: Date,
  fineAmount: Decimal | number = 200
): { memberId: string; contributionDueId: string; amount: Decimal; postedOn: Date } | null {
  const unpaid = new Decimal(due.amount.toString()).minus(new Decimal(due.paidAmount.toString()));
  if (unpaid.lte(0)) return null;

  // If today is past graceEnd (i.e. strictly greater than graceEnd date)
  if (today.getTime() > due.graceEnd.getTime()) {
    return {
      memberId: due.memberId,
      contributionDueId: due.id,
      amount: new Decimal(fineAmount.toString()),
      postedOn: new Date(today),
    };
  }

  return null;
}

/**
 * Payment allocation for contributions (Section 3.5):
 * 1. Oldest unpaid contribution due first (by BS year, month)
 * 2. Then unpaid contribution fines, oldest first (by postedOn)
 * 3. Any remainder becomes advance credit
 */
export function allocateContribution(
  paymentAmount: Decimal | string | number,
  dues: {
    id: string;
    bsYear: number;
    bsMonth: number;
    amount: Decimal | string | number;
    paidAmount: Decimal | string | number;
  }[],
  fines: {
    id: string;
    amount: Decimal | string | number;
    paidAmount: Decimal | string | number;
    waivedAmount?: Decimal | string | number;
    postedOn: Date;
  }[],
  advanceIn: Decimal | string | number = 0
): AllocationResult {
  let available = new Decimal(paymentAmount.toString()).plus(new Decimal(advanceIn.toString()));
  const allocations: ContributionAllocation[] = [];
  let totalDues = new Decimal(0);
  let totalFines = new Decimal(0);

  // 1. Sort dues oldest first (bsYear, bsMonth)
  const sortedDues = [...dues].sort((a, b) => {
    if (a.bsYear !== b.bsYear) return a.bsYear - b.bsYear;
    return a.bsMonth - b.bsMonth;
  });

  for (const due of sortedDues) {
    if (available.lte(0)) break;
    const dueAmount = new Decimal(due.amount.toString());
    const paid = new Decimal(due.paidAmount.toString());
    const owed = dueAmount.minus(paid);

    if (owed.gt(0)) {
      const allocate = Decimal.min(available, owed);
      allocations.push({
        target: 'CONTRIBUTION_DUE',
        dueId: due.id,
        amount: allocate,
        bsYear: due.bsYear,
        bsMonth: due.bsMonth,
      });
      available = available.minus(allocate);
      totalDues = totalDues.plus(allocate);
    }
  }

  // 2. Sort unpaid fines oldest first (postedOn)
  const sortedFines = [...fines].sort(
    (a, b) => a.postedOn.getTime() - b.postedOn.getTime()
  );

  for (const fine of sortedFines) {
    if (available.lte(0)) break;
    const fAmt = new Decimal(fine.amount.toString());
    const fPaid = new Decimal(fine.paidAmount.toString());
    const fWaived = new Decimal((fine.waivedAmount ?? 0).toString());
    const owed = fAmt.minus(fPaid).minus(fWaived);

    if (owed.gt(0)) {
      const allocate = Decimal.min(available, owed);
      allocations.push({
        target: 'CONTRIBUTION_FINE',
        fineId: fine.id,
        amount: allocate,
      });
      available = available.minus(allocate);
      totalFines = totalFines.plus(allocate);
    }
  }

  // 3. Remainder becomes advance credit
  let newAdvance = new Decimal(0);
  if (available.gt(0)) {
    allocations.push({
      target: 'ADVANCE',
      amount: available,
    });
    newAdvance = available;
    available = new Decimal(0);
  }

  return {
    allocations,
    remainingAmount: available,
    newAdvanceBalance: newAdvance,
    totalAllocatedToDues: totalDues,
    totalAllocatedToFines: totalFines,
  };
}
