import Decimal from 'decimal.js';

export interface LoanFine {
  id: string;
  amount: Decimal | string | number;
  paidAmount: Decimal | string | number;
  waivedAmount?: Decimal | string | number;
  postedOn: Date;
}

export interface LoanInterestPeriodItem {
  id: string;
  bsYear: number;
  bsMonth: number;
  accrued: Decimal | string | number;
  paid: Decimal | string | number;
  capitalised: Decimal | string | number;
  finalised: boolean;
}

export interface LoanPaymentAllocation {
  target: 'LOAN_FINE' | 'LOAN_INTEREST' | 'LOAN_PRINCIPAL';
  fineId?: string;
  interestPeriodId?: string;
  loanId?: string;
  amount: Decimal;
}

export interface LoanAllocationResult {
  allocations: LoanPaymentAllocation[];
  allocatedFines: Decimal;
  allocatedInterest: Decimal;
  allocatedPrincipal: Decimal;
  remainingPrincipal: Decimal;
}

/**
 * Payment allocation for loans (Section 3.11):
 * 1) fines (oldest first)
 * 2) interest (oldest period first, then interest accrued this month so far)
 * 3) principal
 * If amount exceeds everything owed, reject with error.
 */
export function allocateLoanPayment(
  paymentAmount: Decimal | string | number,
  fines: LoanFine[],
  periods: LoanInterestPeriodItem[],
  accruedOpenMonth: Decimal | string | number = 0,
  principalOutstanding: Decimal | string | number
): LoanAllocationResult {
  let available = new Decimal(paymentAmount.toString());
  const initialPrincipal = new Decimal(principalOutstanding.toString());
  const openAccrued = new Decimal(accruedOpenMonth.toString());

  // Calculate total owed to check for overpayment
  let totalFinesOwed = new Decimal(0);
  for (const f of fines) {
    const fAmt = new Decimal(f.amount.toString());
    const fPaid = new Decimal(f.paidAmount.toString());
    const fWaived = new Decimal((f.waivedAmount ?? 0).toString());
    const owed = Decimal.max(0, fAmt.minus(fPaid).minus(fWaived));
    totalFinesOwed = totalFinesOwed.plus(owed);
  }

  let totalInterestOwed = new Decimal(0);
  for (const p of periods) {
    const pAccrued = new Decimal(p.accrued.toString());
    const pPaid = new Decimal(p.paid.toString());
    const pCap = new Decimal(p.capitalised.toString());
    const owed = Decimal.max(0, pAccrued.minus(pPaid).minus(pCap));
    totalInterestOwed = totalInterestOwed.plus(owed);
  }
  totalInterestOwed = totalInterestOwed.plus(openAccrued);

  const totalOwed = totalFinesOwed.plus(totalInterestOwed).plus(initialPrincipal);

  if (available.gt(totalOwed)) {
    throw new Error(
      `Payment amount (${available.toFixed(2)}) exceeds total amount owed (${totalOwed.toFixed(2)}). Loan overpayment is not permitted.`
    );
  }

  const allocations: LoanPaymentAllocation[] = [];
  let allocatedFines = new Decimal(0);
  let allocatedInterest = new Decimal(0);
  let allocatedPrincipal = new Decimal(0);

  // 1. Fines (oldest first)
  const sortedFines = [...fines].sort(
    (a, b) => a.postedOn.getTime() - b.postedOn.getTime()
  );
  for (const f of sortedFines) {
    if (available.lte(0)) break;
    const fAmt = new Decimal(f.amount.toString());
    const fPaid = new Decimal(f.paidAmount.toString());
    const fWaived = new Decimal((f.waivedAmount ?? 0).toString());
    const owed = Decimal.max(0, fAmt.minus(fPaid).minus(fWaived));

    if (owed.gt(0)) {
      const allocate = Decimal.min(available, owed);
      allocations.push({
        target: 'LOAN_FINE',
        fineId: f.id,
        amount: allocate,
      });
      available = available.minus(allocate);
      allocatedFines = allocatedFines.plus(allocate);
    }
  }

  // 2. Interest: oldest period first, then open accrued
  const sortedPeriods = [...periods].sort((a, b) => {
    if (a.bsYear !== b.bsYear) return a.bsYear - b.bsYear;
    return a.bsMonth - b.bsMonth;
  });

  for (const p of sortedPeriods) {
    if (available.lte(0)) break;
    const pAccrued = new Decimal(p.accrued.toString());
    const pPaid = new Decimal(p.paid.toString());
    const pCap = new Decimal(p.capitalised.toString());
    const owed = Decimal.max(0, pAccrued.minus(pPaid).minus(pCap));

    if (owed.gt(0)) {
      const allocate = Decimal.min(available, owed);
      allocations.push({
        target: 'LOAN_INTEREST',
        interestPeriodId: p.id,
        amount: allocate,
      });
      available = available.minus(allocate);
      allocatedInterest = allocatedInterest.plus(allocate);
    }
  }

  // Open period interest (if any remaining available)
  if (available.gt(0) && openAccrued.gt(0)) {
    const allocate = Decimal.min(available, openAccrued);
    allocations.push({
      target: 'LOAN_INTEREST',
      amount: allocate,
    });
    available = available.minus(allocate);
    allocatedInterest = allocatedInterest.plus(allocate);
  }

  // 3. Principal
  if (available.gt(0) && initialPrincipal.gt(0)) {
    const allocate = Decimal.min(available, initialPrincipal);
    allocations.push({
      target: 'LOAN_PRINCIPAL',
      amount: allocate,
    });
    available = available.minus(allocate);
    allocatedPrincipal = allocatedPrincipal.plus(allocate);
  }

  const remainingPrincipal = initialPrincipal.minus(allocatedPrincipal);

  return {
    allocations,
    allocatedFines,
    allocatedInterest,
    allocatedPrincipal,
    remainingPrincipal,
  };
}

/**
 * Capitalise unpaid interest into loan principal (Section 3.7):
 * Effect:
 * - principalOutstanding += amount
 * - periods' capitalised += allocated amount
 * - returns updated principal and event details
 */
export function capitalise(
  currentPrincipal: Decimal | string | number,
  unpaidPeriods: { id: string; accrued: Decimal; paid: Decimal; capitalised: Decimal }[],
  amountToCapitalise: Decimal | string | number
): {
  newPrincipal: Decimal;
  totalCapitalised: Decimal;
  periodUpdates: { id: string; addCapitalised: Decimal }[];
} {
  let rem = new Decimal(amountToCapitalise.toString());
  const periodUpdates: { id: string; addCapitalised: Decimal }[] = [];
  let totalCap = new Decimal(0);

  for (const p of unpaidPeriods) {
    if (rem.lte(0)) break;
    const unpaid = p.accrued.minus(p.paid).minus(p.capitalised);
    if (unpaid.gt(0)) {
      const cap = Decimal.min(rem, unpaid);
      periodUpdates.push({
        id: p.id,
        addCapitalised: cap,
      });
      rem = rem.minus(cap);
      totalCap = totalCap.plus(cap);
    }
  }

  const newPrincipal = new Decimal(currentPrincipal.toString()).plus(totalCap);

  return {
    newPrincipal,
    totalCapitalised: totalCap,
    periodUpdates,
  };
}

/**
 * Validate guarantors for a loan (Section 3.6):
 * Exactly 3 guarantors, all ACTIVE members, all different, none of them the borrower.
 */
export function validateGuarantors(
  borrowerId: string,
  guarantorMemberIds: string[],
  activeMemberIds: Set<string>
): { valid: boolean; error?: string } {
  if (guarantorMemberIds.length !== 3) {
    return { valid: false, error: 'A loan must have exactly 3 guarantors.' };
  }

  const uniqueIds = new Set(guarantorMemberIds);
  if (uniqueIds.size !== 3) {
    return { valid: false, error: 'All 3 guarantors must be different members.' };
  }

  if (uniqueIds.has(borrowerId)) {
    return { valid: false, error: 'Borrower cannot be a guarantor for their own loan.' };
  }

  for (const gid of guarantorMemberIds) {
    if (!activeMemberIds.has(gid)) {
      return { valid: false, error: 'All guarantors must be ACTIVE members.' };
    }
  }

  return { valid: true };
}
