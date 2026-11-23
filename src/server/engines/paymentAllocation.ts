import Decimal from 'decimal.js';

export type PaymentType =
  | 'AUTOMATIC'
  | 'MONTHLY_LEVY_CONTRIBUTION'
  | 'MONTHLY_LEVY_FINE'
  | 'LOAN_INTEREST'
  | 'LOAN_FINE'
  | 'LOAN_PRINCIPAL';

export interface PaymentDueItem {
  id: string;
  bsYear: number;
  bsMonth: number;
  amount: Decimal | string | number;
  paidAmount: Decimal | string | number;
  status?: string;
}

export interface PaymentFineItem {
  id: string;
  type: 'CONTRIBUTION' | 'LOAN_INTEREST' | string;
  amount: Decimal | string | number;
  paidAmount: Decimal | string | number;
  waivedAmount?: Decimal | string | number;
  postedOn: Date | string;
  status?: string;
}

export interface PaymentInterestPeriodItem {
  id: string;
  bsYear: number;
  bsMonth: number;
  accrued: Decimal | string | number;
  paid: Decimal | string | number;
  capitalised?: Decimal | string | number;
}

export interface PaymentLoanItem {
  id: string;
  loanNo: string;
  principalOutstanding: Decimal | string | number;
  periods?: PaymentInterestPeriodItem[];
}

export interface AllocationLine {
  target: 'LOAN_FINE' | 'CONTRIBUTION_FINE' | 'LOAN_INTEREST' | 'LOAN_PRINCIPAL' | 'CONTRIBUTION_DUE' | 'ADVANCE';
  fineId?: string;
  interestPeriodId?: string;
  dueId?: string;
  loanId?: string;
  bsYear?: number;
  bsMonth?: number;
  amount: Decimal;
  label: string;
  description: string;
}

export interface PaymentAllocationResult {
  allocations: AllocationLine[];
  totalLoanFine: Decimal;
  totalLevyFine: Decimal;
  totalInterest: Decimal;
  totalPrincipal: Decimal;
  totalDues: Decimal;
  totalAdvance: Decimal;
  remainingAmount: Decimal;
}

export interface AdvanceOffsetResult {
  advToLoanFine: Decimal;
  advToLevyFine: Decimal;
  advToInterest: Decimal;
  advToPrincipal: Decimal;
  remainingAdvance: Decimal;
  adjustedLoanFine: Decimal;
  adjustedLevyFine: Decimal;
  adjustedInterest: Decimal;
  adjustedPrincipal: Decimal;
}

export interface MemberFinancialSummary {
  monthlyLevyAccumulatedAmount: Decimal;
  monthlyLevyAccumulatedMonths: number;
  monthlyLevyDueAmount: Decimal;
  monthlyLevyDueMonths: number;
  monthlyLevyFineAmount: Decimal;
  loanPrincipalRemaining: Decimal;
  loanInterestRemaining: Decimal;
  loanInterestFineAmount: Decimal;
  advanceBalance: Decimal;
  advanceOffset: AdvanceOffsetResult;
}

/**
 * Calculate member financial summary records:
 * - Monthly Levy Accumulated - Amount (no of months)
 * - Monthly Levy Due - Amount (no of months)
 * - Monthly Levy Fine - Amount
 * - Loan Amount Remaining - Amount
 * - Loan Interest Remaining - Amount
 * - Loan Interest Fine - Amount
 * - Advance - (Offset against fines -> interest -> loan principal if applicable)
 */
export function calculateMemberFinancialSummary(params: {
  advanceBalance: Decimal | string | number;
  dues: PaymentDueItem[];
  fines: PaymentFineItem[];
  loans: PaymentLoanItem[];
}): MemberFinancialSummary {
  const advanceBalance = new Decimal(params.advanceBalance?.toString() || '0');

  // 1. Monthly Levy Accumulated: sum of paid amounts across all dues, and count of paid months
  let accumulatedAmount = new Decimal(0);
  let accumulatedMonths = 0;

  // 2. Monthly Levy Due: sum of unpaid dues amounts, and count of unpaid months
  let dueAmount = new Decimal(0);
  let dueMonths = 0;

  for (const d of params.dues) {
    const dAmt = new Decimal(d.amount.toString());
    const dPaid = new Decimal(d.paidAmount.toString());
    const unpaid = Decimal.max(0, dAmt.minus(dPaid));

    accumulatedAmount = accumulatedAmount.plus(dPaid);

    if (d.status === 'PAID' || dPaid.gte(dAmt)) {
      accumulatedMonths += 1;
    } else if (unpaid.gt(0)) {
      dueAmount = dueAmount.plus(unpaid);
      dueMonths += 1;
    }
  }

  // 3. Monthly Levy Fine: sum of unpaid contribution fines
  let levyFineAmount = new Decimal(0);
  // 6. Loan Interest Fine: sum of unpaid loan interest fines
  let loanInterestFineAmount = new Decimal(0);

  for (const f of params.fines) {
    if (f.status === 'PAID' || f.status === 'WAIVED') continue;
    const fAmt = new Decimal(f.amount.toString());
    const fPaid = new Decimal(f.paidAmount.toString());
    const fWaived = new Decimal((f.waivedAmount ?? 0).toString());
    const unpaid = Decimal.max(0, fAmt.minus(fPaid).minus(fWaived));

    if (unpaid.gt(0)) {
      if (f.type === 'CONTRIBUTION') {
        levyFineAmount = levyFineAmount.plus(unpaid);
      } else if (f.type === 'LOAN_INTEREST') {
        loanInterestFineAmount = loanInterestFineAmount.plus(unpaid);
      }
    }
  }

  // 4. Loan Amount Remaining: sum of principalOutstanding across active loans
  let loanPrincipalRemaining = new Decimal(0);
  // 5. Loan Interest Remaining: sum of unpaid interest across loan periods
  let loanInterestRemaining = new Decimal(0);

  for (const l of params.loans) {
    const lPrincipal = new Decimal(l.principalOutstanding.toString());
    loanPrincipalRemaining = loanPrincipalRemaining.plus(lPrincipal);

    if (l.periods) {
      for (const p of l.periods) {
        const pAccrued = new Decimal(p.accrued.toString());
        const pPaid = new Decimal(p.paid.toString());
        const pCap = new Decimal((p.capitalised ?? 0).toString());
        const unpaidInt = Decimal.max(0, pAccrued.minus(pPaid).minus(pCap));
        loanInterestRemaining = loanInterestRemaining.plus(unpaidInt);
      }
    }
  }

  // 7. Advance offset calculation:
  // "If no loan amount remains and not any types of fine remains if any fine remains first deduct the advance from fine
  // and if no any fines remain then advance amount is deducted in loan interest if no interests remain then deduct the [loan amount]"
  const advanceOffset = calculateAdvanceOffset({
    advanceBalance,
    loanInterestFineAmount,
    levyFineAmount,
    loanInterestRemaining,
    loanPrincipalRemaining,
  });

  return {
    monthlyLevyAccumulatedAmount: accumulatedAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    monthlyLevyAccumulatedMonths: accumulatedMonths,
    monthlyLevyDueAmount: dueAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    monthlyLevyDueMonths: dueMonths,
    monthlyLevyFineAmount: levyFineAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    loanPrincipalRemaining: loanPrincipalRemaining.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    loanInterestRemaining: loanInterestRemaining.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    loanInterestFineAmount: loanInterestFineAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    advanceBalance: advanceBalance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    advanceOffset,
  };
}

/**
 * Calculate Advance deduction / offset:
 * 1. Deduct advance from fines first (loan interest fine, then levy fine)
 * 2. If no fines remain, deduct from loan interest
 * 3. If no loan interest remains, deduct from loan principal
 * 4. Remainder remains as net advance
 */
export function calculateAdvanceOffset(params: {
  advanceBalance: Decimal | string | number;
  loanInterestFineAmount: Decimal | string | number;
  levyFineAmount: Decimal | string | number;
  loanInterestRemaining: Decimal | string | number;
  loanPrincipalRemaining: Decimal | string | number;
}): AdvanceOffsetResult {
  let rem = new Decimal(params.advanceBalance.toString());
  const origLoanFine = new Decimal(params.loanInterestFineAmount.toString());
  const origLevyFine = new Decimal(params.levyFineAmount.toString());
  const origInterest = new Decimal(params.loanInterestRemaining.toString());
  const origPrincipal = new Decimal(params.loanPrincipalRemaining.toString());

  // Step 1: Deduct from fines
  const advToLoanFine = Decimal.min(rem, origLoanFine);
  rem = rem.minus(advToLoanFine);
  const adjLoanFine = origLoanFine.minus(advToLoanFine);

  const advToLevyFine = Decimal.min(rem, origLevyFine);
  rem = rem.minus(advToLevyFine);
  const adjLevyFine = origLevyFine.minus(advToLevyFine);

  // Step 2: If no fines remain, deduct from loan interest
  let advToInterest = new Decimal(0);
  let adjInterest = origInterest;
  if (adjLoanFine.isZero() && adjLevyFine.isZero() && rem.gt(0)) {
    advToInterest = Decimal.min(rem, origInterest);
    rem = rem.minus(advToInterest);
    adjInterest = origInterest.minus(advToInterest);
  }

  // Step 3: If no loan interest remains, deduct from loan principal
  let advToPrincipal = new Decimal(0);
  let adjPrincipal = origPrincipal;
  if (adjLoanFine.isZero() && adjLevyFine.isZero() && adjInterest.isZero() && rem.gt(0)) {
    advToPrincipal = Decimal.min(rem, origPrincipal);
    rem = rem.minus(advToPrincipal);
    adjPrincipal = origPrincipal.minus(advToPrincipal);
  }

  return {
    advToLoanFine: advToLoanFine.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    advToLevyFine: advToLevyFine.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    advToInterest: advToInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    advToPrincipal: advToPrincipal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    remainingAdvance: rem.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    adjustedLoanFine: adjLoanFine.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    adjustedLevyFine: adjLevyFine.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    adjustedInterest: adjInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    adjustedPrincipal: adjPrincipal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}

/**
 * Allocate payment amount according to selected Payment Type or Automatic priority:
 * Priority in Automatic Preview:
 * 1. Interest fine (LOAN_FINE)
 * 2. Levy fine (CONTRIBUTION_FINE)
 * 3. Interest payment (LOAN_INTEREST)
 * 4. Principal amount repay (LOAN_PRINCIPAL)
 * 5. Monthly levy due (CONTRIBUTION_DUE)
 * 6. Advance amount (ADVANCE)
 */
export function allocateMemberPayment(params: {
  amount: Decimal | string | number;
  paymentType: PaymentType;
  dues: PaymentDueItem[];
  fines: PaymentFineItem[];
  loans: PaymentLoanItem[];
  selectedLoanId?: string;
}): PaymentAllocationResult {
  let available = new Decimal(params.amount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (available.lt(0)) {
    available = new Decimal(0);
  }

  const allocations: AllocationLine[] = [];
  let totalLoanFine = new Decimal(0);
  let totalLevyFine = new Decimal(0);
  let totalInterest = new Decimal(0);
  let totalPrincipal = new Decimal(0);
  let totalDues = new Decimal(0);
  let totalAdvance = new Decimal(0);

  const dues = [...params.dues].sort((a, b) => {
    if (a.bsYear !== b.bsYear) return a.bsYear - b.bsYear;
    return a.bsMonth - b.bsMonth;
  });

  const loanFines = params.fines
    .filter((f) => f.type === 'LOAN_INTEREST' && f.status !== 'PAID' && f.status !== 'WAIVED')
    .sort((a, b) => new Date(a.postedOn).getTime() - new Date(b.postedOn).getTime());

  const levyFines = params.fines
    .filter((f) => f.type === 'CONTRIBUTION' && f.status !== 'PAID' && f.status !== 'WAIVED')
    .sort((a, b) => new Date(a.postedOn).getTime() - new Date(b.postedOn).getTime());

  // Determine target loans
  const relevantLoans = params.selectedLoanId
    ? params.loans.filter((l) => l.id === params.selectedLoanId)
    : params.loans;

  // Flatten and sort loan interest periods
  const interestPeriods: {
    loanId: string;
    loanNo: string;
    id: string;
    bsYear: number;
    bsMonth: number;
    unpaidInterest: Decimal;
  }[] = [];

  for (const l of relevantLoans) {
    if (l.periods) {
      for (const p of l.periods) {
        const accrued = new Decimal(p.accrued.toString());
        const paid = new Decimal(p.paid.toString());
        const cap = new Decimal((p.capitalised ?? 0).toString());
        const unpaid = Decimal.max(0, accrued.minus(paid).minus(cap));
        if (unpaid.gt(0)) {
          interestPeriods.push({
            loanId: l.id,
            loanNo: l.loanNo,
            id: p.id,
            bsYear: p.bsYear,
            bsMonth: p.bsMonth,
            unpaidInterest: unpaid,
          });
        }
      }
    }
  }

  interestPeriods.sort((a, b) => {
    if (a.bsYear !== b.bsYear) return a.bsYear - b.bsYear;
    return a.bsMonth - b.bsMonth;
  });

  // Helpers to allocate specific categories
  const deductLoanFines = () => {
    for (const f of loanFines) {
      if (available.lte(0)) break;
      const fAmt = new Decimal(f.amount.toString());
      const fPaid = new Decimal(f.paidAmount.toString());
      const fWaived = new Decimal((f.waivedAmount ?? 0).toString());
      const owed = Decimal.max(0, fAmt.minus(fPaid).minus(fWaived));

      if (owed.gt(0)) {
        const alloc = Decimal.min(available, owed);
        allocations.push({
          target: 'LOAN_FINE',
          fineId: f.id,
          amount: alloc,
          label: 'Loan Interest Fine',
          description: `Fine ID: ${f.id.slice(-6)} (Posted: ${new Date(f.postedOn).toLocaleDateString()})`,
        });
        available = available.minus(alloc);
        totalLoanFine = totalLoanFine.plus(alloc);
      }
    }
  };

  const deductLevyFines = () => {
    for (const f of levyFines) {
      if (available.lte(0)) break;
      const fAmt = new Decimal(f.amount.toString());
      const fPaid = new Decimal(f.paidAmount.toString());
      const fWaived = new Decimal((f.waivedAmount ?? 0).toString());
      const owed = Decimal.max(0, fAmt.minus(fPaid).minus(fWaived));

      if (owed.gt(0)) {
        const alloc = Decimal.min(available, owed);
        allocations.push({
          target: 'CONTRIBUTION_FINE',
          fineId: f.id,
          amount: alloc,
          label: 'Monthly Levy Fine',
          description: `Fine ID: ${f.id.slice(-6)} (Late Levy Penalty)`,
        });
        available = available.minus(alloc);
        totalLevyFine = totalLevyFine.plus(alloc);
      }
    }
  };

  const deductLoanInterest = () => {
    for (const p of interestPeriods) {
      if (available.lte(0)) break;
      if (p.unpaidInterest.gt(0)) {
        const alloc = Decimal.min(available, p.unpaidInterest);
        allocations.push({
          target: 'LOAN_INTEREST',
          interestPeriodId: p.id,
          loanId: p.loanId,
          bsYear: p.bsYear,
          bsMonth: p.bsMonth,
          amount: alloc,
          label: 'Loan Interest',
          description: `Loan ${p.loanNo} - Year ${p.bsYear} Month ${p.bsMonth}`,
        });
        available = available.minus(alloc);
        totalInterest = totalInterest.plus(alloc);
      }
    }
  };

  const deductLoanPrincipal = () => {
    for (const l of relevantLoans) {
      if (available.lte(0)) break;
      const principal = new Decimal(l.principalOutstanding.toString());
      if (principal.gt(0)) {
        const alloc = Decimal.min(available, principal);
        allocations.push({
          target: 'LOAN_PRINCIPAL',
          loanId: l.id,
          amount: alloc,
          label: 'Loan Principal Repayment',
          description: `Loan ${l.loanNo} Principal Reduction`,
        });
        available = available.minus(alloc);
        totalPrincipal = totalPrincipal.plus(alloc);
      }
    }
  };

  const deductMonthlyLevyDues = () => {
    for (const d of dues) {
      if (available.lte(0)) break;
      const dAmt = new Decimal(d.amount.toString());
      const dPaid = new Decimal(d.paidAmount.toString());
      const owed = Decimal.max(0, dAmt.minus(dPaid));

      if (owed.gt(0)) {
        const alloc = Decimal.min(available, owed);
        allocations.push({
          target: 'CONTRIBUTION_DUE',
          dueId: d.id,
          bsYear: d.bsYear,
          bsMonth: d.bsMonth,
          amount: alloc,
          label: 'Monthly Levy Contribution',
          description: `Year ${d.bsYear} Month ${d.bsMonth} Installment`,
        });
        available = available.minus(alloc);
        totalDues = totalDues.plus(alloc);
      }
    }
  };

  const allocateRemainingToAdvance = () => {
    if (available.gt(0)) {
      allocations.push({
        target: 'ADVANCE',
        amount: available,
        label: 'Advance Balance',
        description: 'Advance credit for future obligations',
      });
      totalAdvance = totalAdvance.plus(available);
      available = new Decimal(0);
    }
  };

  // Execution branching based on paymentType
  switch (params.paymentType) {
    case 'AUTOMATIC': {
      // 1. deduct interest fine
      deductLoanFines();
      // 2. deduct levy fine
      deductLevyFines();
      // 3. deduct interest payment
      deductLoanInterest();
      // 4. deduct principal amount repay
      deductLoanPrincipal();
      // 5. deduct monthly levy dues (if any)
      deductMonthlyLevyDues();
      // 6. advance amount
      allocateRemainingToAdvance();
      break;
    }
    case 'MONTHLY_LEVY_CONTRIBUTION': {
      deductMonthlyLevyDues();
      allocateRemainingToAdvance();
      break;
    }
    case 'MONTHLY_LEVY_FINE': {
      deductLevyFines();
      allocateRemainingToAdvance();
      break;
    }
    case 'LOAN_INTEREST': {
      deductLoanInterest();
      allocateRemainingToAdvance();
      break;
    }
    case 'LOAN_FINE': {
      deductLoanFines();
      allocateRemainingToAdvance();
      break;
    }
    case 'LOAN_PRINCIPAL': {
      deductLoanPrincipal();
      allocateRemainingToAdvance();
      break;
    }
  }

  return {
    allocations,
    totalLoanFine: totalLoanFine.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    totalLevyFine: totalLevyFine.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    totalInterest: totalInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    totalPrincipal: totalPrincipal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    totalDues: totalDues.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    totalAdvance: totalAdvance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    remainingAmount: available.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}
