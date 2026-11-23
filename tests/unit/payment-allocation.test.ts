import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateMemberFinancialSummary,
  calculateAdvanceOffset,
  allocateMemberPayment,
  PaymentDueItem,
  PaymentFineItem,
  PaymentLoanItem,
} from '@/server/engines/paymentAllocation';

describe('Payment Allocation & Member Records Calculation Engine', () => {
  describe('calculateMemberFinancialSummary', () => {
    it('accurately calculates accumulated monthly levy and due months', () => {
      const dues: PaymentDueItem[] = [
        { id: 'd1', bsYear: 2083, bsMonth: 1, amount: 1000, paidAmount: 1000, status: 'PAID' },
        { id: 'd2', bsYear: 2083, bsMonth: 2, amount: 1000, paidAmount: 1000, status: 'PAID' },
        { id: 'd3', bsYear: 2083, bsMonth: 3, amount: 1000, paidAmount: 500, status: 'PARTIAL' },
        { id: 'd4', bsYear: 2083, bsMonth: 4, amount: 1000, paidAmount: 0, status: 'PENDING' },
      ];

      const fines: PaymentFineItem[] = [
        { id: 'f1', type: 'CONTRIBUTION', amount: 200, paidAmount: 0, postedOn: '2026-05-15' },
        { id: 'f2', type: 'LOAN_INTEREST', amount: 100, paidAmount: 0, postedOn: '2026-06-15' },
      ];

      const loans: PaymentLoanItem[] = [
        {
          id: 'l1',
          loanNo: 'LN-0001',
          principalOutstanding: 50000,
          periods: [
            { id: 'p1', bsYear: 2083, bsMonth: 3, accrued: 500, paid: 200, capitalised: 0 },
            { id: 'p2', bsYear: 2083, bsMonth: 4, accrued: 500, paid: 0, capitalised: 0 },
          ],
        },
      ];

      const res = calculateMemberFinancialSummary({
        advanceBalance: 0,
        dues,
        fines,
        loans,
      });

      // Accumulated: 1000 + 1000 + 500 = 2500. Fully paid months: 2.
      expect(res.monthlyLevyAccumulatedAmount.toNumber()).toBe(2500);
      expect(res.monthlyLevyAccumulatedMonths).toBe(2);

      // Due: (1000 - 500) + 1000 = 1500. Unpaid months: 2 (d3 partial, d4 pending)
      expect(res.monthlyLevyDueAmount.toNumber()).toBe(1500);
      expect(res.monthlyLevyDueMonths).toBe(2);

      // Fines
      expect(res.monthlyLevyFineAmount.toNumber()).toBe(200);
      expect(res.loanInterestFineAmount.toNumber()).toBe(100);

      // Loans
      expect(res.loanPrincipalRemaining.toNumber()).toBe(50000);
      // Interest remaining: (500 - 200) + 500 = 800
      expect(res.loanInterestRemaining.toNumber()).toBe(800);
    });
  });

  describe('calculateAdvanceOffset', () => {
    it('keeps advance intact if no loans, no interest, and no fines exist', () => {
      const res = calculateAdvanceOffset({
        advanceBalance: 1500,
        loanInterestFineAmount: 0,
        levyFineAmount: 0,
        loanInterestRemaining: 0,
        loanPrincipalRemaining: 0,
      });

      expect(res.remainingAdvance.toNumber()).toBe(1500);
      expect(res.advToLoanFine.toNumber()).toBe(0);
      expect(res.advToLevyFine.toNumber()).toBe(0);
      expect(res.advToInterest.toNumber()).toBe(0);
      expect(res.advToPrincipal.toNumber()).toBe(0);
    });

    it('first deducts advance from fines (loan interest fine, then levy fine)', () => {
      const res = calculateAdvanceOffset({
        advanceBalance: 250,
        loanInterestFineAmount: 100,
        levyFineAmount: 200,
        loanInterestRemaining: 500,
        loanPrincipalRemaining: 10000,
      });

      // 100 to loan fine (rem adv: 150)
      expect(res.advToLoanFine.toNumber()).toBe(100);
      expect(res.adjustedLoanFine.toNumber()).toBe(0);

      // 150 to levy fine (rem adv: 0)
      expect(res.advToLevyFine.toNumber()).toBe(150);
      expect(res.adjustedLevyFine.toNumber()).toBe(50);

      // Fines still remain, so advance cannot touch interest or principal
      expect(res.advToInterest.toNumber()).toBe(0);
      expect(res.advToPrincipal.toNumber()).toBe(0);
      expect(res.remainingAdvance.toNumber()).toBe(0);
    });

    it('deducts from interest if all fines are cleared, then principal if interest cleared', () => {
      const res = calculateAdvanceOffset({
        advanceBalance: 1000,
        loanInterestFineAmount: 100,
        levyFineAmount: 200,
        loanInterestRemaining: 300,
        loanPrincipalRemaining: 5000,
      });

      // 100 loan fine + 200 levy fine = 300 fines. Rem adv: 700
      expect(res.advToLoanFine.toNumber()).toBe(100);
      expect(res.advToLevyFine.toNumber()).toBe(200);

      // 300 to interest. Rem adv: 400
      expect(res.advToInterest.toNumber()).toBe(300);
      expect(res.adjustedInterest.toNumber()).toBe(0);

      // 400 to principal. Rem adv: 0
      expect(res.advToPrincipal.toNumber()).toBe(400);
      expect(res.adjustedPrincipal.toNumber()).toBe(4600);
      expect(res.remainingAdvance.toNumber()).toBe(0);
    });

    it('leaves net advance when advance exceeds all fines, interest, and principal', () => {
      const res = calculateAdvanceOffset({
        advanceBalance: 2000,
        loanInterestFineAmount: 100,
        levyFineAmount: 100,
        loanInterestRemaining: 200,
        loanPrincipalRemaining: 1000,
      });

      // Fines: 200, Interest: 200, Principal: 1000 = Total 1400.
      // Remainder: 600
      expect(res.remainingAdvance.toNumber()).toBe(600);
      expect(res.adjustedLoanFine.toNumber()).toBe(0);
      expect(res.adjustedLevyFine.toNumber()).toBe(0);
      expect(res.adjustedInterest.toNumber()).toBe(0);
      expect(res.adjustedPrincipal.toNumber()).toBe(0);
    });
  });

  describe('allocateMemberPayment - AUTOMATIC Waterfall', () => {
    it('strictly follows deduction order: interest fine -> levy fine -> interest payment -> principal repay -> levy due -> advance', () => {
      const dues: PaymentDueItem[] = [
        { id: 'd1', bsYear: 2083, bsMonth: 5, amount: 1000, paidAmount: 0 },
      ];
      const fines: PaymentFineItem[] = [
        { id: 'f-levy', type: 'CONTRIBUTION', amount: 200, paidAmount: 0, postedOn: '2026-09-01' },
        { id: 'f-loan', type: 'LOAN_INTEREST', amount: 100, paidAmount: 0, postedOn: '2026-09-02' },
      ];
      const loans: PaymentLoanItem[] = [
        {
          id: 'l1',
          loanNo: 'LN-001',
          principalOutstanding: 3000,
          periods: [
            { id: 'p1', bsYear: 2083, bsMonth: 4, accrued: 500, paid: 0, capitalised: 0 },
          ],
        },
      ];

      // Test partial step 1: 50 pays interest fine only
      const r1 = allocateMemberPayment({
        amount: 50,
        paymentType: 'AUTOMATIC',
        dues,
        fines,
        loans,
      });
      expect(r1.allocations).toHaveLength(1);
      expect(r1.allocations[0].target).toBe('LOAN_FINE');
      expect(r1.totalLoanFine.toNumber()).toBe(50);

      // Test step 1 & 2: 250 pays 100 loan fine + 150 levy fine
      const r2 = allocateMemberPayment({
        amount: 250,
        paymentType: 'AUTOMATIC',
        dues,
        fines,
        loans,
      });
      expect(r2.totalLoanFine.toNumber()).toBe(100);
      expect(r2.totalLevyFine.toNumber()).toBe(150);
      expect(r2.totalInterest.toNumber()).toBe(0);

      // Test step 1, 2 & 3: 500 pays 100 loan fine + 200 levy fine + 200 interest
      const r3 = allocateMemberPayment({
        amount: 500,
        paymentType: 'AUTOMATIC',
        dues,
        fines,
        loans,
      });
      expect(r3.totalLoanFine.toNumber()).toBe(100);
      expect(r3.totalLevyFine.toNumber()).toBe(200);
      expect(r3.totalInterest.toNumber()).toBe(200);
      expect(r3.totalPrincipal.toNumber()).toBe(0);

      // Test step 1, 2, 3 & 4: 2000 pays:
      // 100 loan fine + 200 levy fine + 500 interest + 1200 principal
      const r4 = allocateMemberPayment({
        amount: 2000,
        paymentType: 'AUTOMATIC',
        dues,
        fines,
        loans,
      });
      expect(r4.totalLoanFine.toNumber()).toBe(100);
      expect(r4.totalLevyFine.toNumber()).toBe(200);
      expect(r4.totalInterest.toNumber()).toBe(500);
      expect(r4.totalPrincipal.toNumber()).toBe(1200);
      expect(r4.totalDues.toNumber()).toBe(0);
      expect(r4.totalAdvance.toNumber()).toBe(0);

      // Test step 1, 2, 3, 4, 5 & 6: 5500 pays:
      // 100 loan fine + 200 levy fine + 500 interest + 3000 principal + 1000 dues + 700 advance
      const r5 = allocateMemberPayment({
        amount: 5500,
        paymentType: 'AUTOMATIC',
        dues,
        fines,
        loans,
      });
      expect(r5.totalLoanFine.toNumber()).toBe(100);
      expect(r5.totalLevyFine.toNumber()).toBe(200);
      expect(r5.totalInterest.toNumber()).toBe(500);
      expect(r5.totalPrincipal.toNumber()).toBe(3000);
      expect(r5.totalDues.toNumber()).toBe(1000);
      expect(r5.totalAdvance.toNumber()).toBe(700);
    });
  });

  describe('allocateMemberPayment - Specific Payment Types', () => {
    const dues: PaymentDueItem[] = [
      { id: 'd1', bsYear: 2083, bsMonth: 1, amount: 1000, paidAmount: 0 },
    ];
    const fines: PaymentFineItem[] = [
      { id: 'f-levy', type: 'CONTRIBUTION', amount: 200, paidAmount: 0, postedOn: '2026-09-01' },
      { id: 'f-loan', type: 'LOAN_INTEREST', amount: 100, paidAmount: 0, postedOn: '2026-09-02' },
    ];
    const loans: PaymentLoanItem[] = [
      {
        id: 'l1',
        loanNo: 'LN-001',
        principalOutstanding: 5000,
        periods: [
          { id: 'p1', bsYear: 2083, bsMonth: 1, accrued: 400, paid: 0, capitalised: 0 },
        ],
      },
    ];

    it('MONTHLY_LEVY_CONTRIBUTION applies to dues and remaining to advance', () => {
      const res = allocateMemberPayment({
        amount: 1500,
        paymentType: 'MONTHLY_LEVY_CONTRIBUTION',
        dues,
        fines,
        loans,
      });
      expect(res.totalDues.toNumber()).toBe(1000);
      expect(res.totalAdvance.toNumber()).toBe(500);
      expect(res.totalLoanFine.toNumber()).toBe(0);
      expect(res.totalLevyFine.toNumber()).toBe(0);
      expect(res.totalInterest.toNumber()).toBe(0);
      expect(res.totalPrincipal.toNumber()).toBe(0);
    });

    it('MONTHLY_LEVY_FINE applies only to levy fines and remainder to advance', () => {
      const res = allocateMemberPayment({
        amount: 300,
        paymentType: 'MONTHLY_LEVY_FINE',
        dues,
        fines,
        loans,
      });
      expect(res.totalLevyFine.toNumber()).toBe(200);
      expect(res.totalAdvance.toNumber()).toBe(100);
    });

    it('LOAN_INTEREST applies to loan interest and remainder to advance', () => {
      const res = allocateMemberPayment({
        amount: 600,
        paymentType: 'LOAN_INTEREST',
        dues,
        fines,
        loans,
      });
      expect(res.totalInterest.toNumber()).toBe(400);
      expect(res.totalAdvance.toNumber()).toBe(200);
    });

    it('LOAN_FINE applies to loan fine and remainder to advance', () => {
      const res = allocateMemberPayment({
        amount: 150,
        paymentType: 'LOAN_FINE',
        dues,
        fines,
        loans,
      });
      expect(res.totalLoanFine.toNumber()).toBe(100);
      expect(res.totalAdvance.toNumber()).toBe(50);
    });

    it('LOAN_PRINCIPAL applies to principal outstanding and remainder to advance', () => {
      const res = allocateMemberPayment({
        amount: 6000,
        paymentType: 'LOAN_PRINCIPAL',
        dues,
        fines,
        loans,
      });
      expect(res.totalPrincipal.toNumber()).toBe(5000);
      expect(res.totalAdvance.toNumber()).toBe(1000);
    });
  });
});
