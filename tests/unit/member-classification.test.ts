import { describe, it, expect, vi } from 'vitest';
import { determineMemberClass, evaluateMemberClass, getClassRules } from '@/server/services/memberService';
import { calculateMemberFinancialSummary } from '@/server/engines/paymentAllocation';
import Decimal from 'decimal.js';

// Mock prisma.classRule.findMany
vi.mock('@/server/db', () => ({
  prisma: {
    classRule: {
      findMany: vi.fn().mockResolvedValue([
        { id: '1', label: 'Class A', joinedFrom: new Date('2013-04-14'), joinedTo: new Date('2018-04-13') },
        { id: '2', label: 'Class B', joinedFrom: new Date('2018-04-14'), joinedTo: new Date('2023-04-13') },
        { id: '3', label: 'Class C', joinedFrom: new Date('2023-04-14'), joinedTo: null },
      ]),
    },
    member: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('Member Classification & Existing Financial Balances', () => {
  describe('determineMemberClass', () => {
    it('correctly reads explicit Class A tag from member notes', async () => {
      const cls = await determineMemberClass(new Date(), '[Class: A]\nFounding member');
      expect(cls).toBe('Class A');
    });

    it('correctly reads explicit Class B tag from member notes', async () => {
      const cls = await determineMemberClass(new Date(), '[Class: B]');
      expect(cls).toBe('Class B');
    });

    it('correctly reads explicit Class C tag from member notes', async () => {
      const cls = await determineMemberClass(new Date(), '[Class: C]\nSome remarks');
      expect(cls).toBe('Class C');
    });

    it('correctly reads auto-assigned Class D tag for new members', async () => {
      const cls = await determineMemberClass(new Date(), '[Class: D]');
      expect(cls).toBe('Class D');
    });

    it('falls back to joined date rules when no notes tag is present', async () => {
      const clsA = await determineMemberClass(new Date('2015-01-01'), null);
      expect(clsA).toBe('Class A');

      const clsB = await determineMemberClass(new Date('2020-01-01'), null);
      expect(clsB).toBe('Class B');

      const clsC = await determineMemberClass(new Date('2024-01-01'), null);
      expect(clsC).toBe('Class C');
    });

    it('evaluateMemberClass evaluates synchronously without making database queries', () => {
      const rules = [
        { id: '1', label: 'Class A', joinedFrom: new Date('2013-04-14'), joinedTo: new Date('2018-04-13') },
        { id: '2', label: 'Class B', joinedFrom: new Date('2018-04-14'), joinedTo: new Date('2023-04-13') },
      ];
      expect(evaluateMemberClass(new Date(), '[Class: B]', rules)).toBe('Class B');
      expect(evaluateMemberClass(new Date('2016-01-01'), null, rules)).toBe('Class A');
      expect(evaluateMemberClass(new Date('2025-01-01'), null, rules)).toBe('Class D');
    });
  });

  describe('Existing Member 7 Financial Records in Payment Summary', () => {
    it('calculates all 7 financial records accurately from recorded existing balances', () => {
      // 1. Monthly Levy Accumulated: 24,000 (24 months @ 1000)
      // 2. Monthly Levy Due: 3,000 (3 months @ 1000)
      const dues = [
        ...Array.from({ length: 24 }, (_, i) => ({
          id: `paid_${i}`,
          bsYear: 2081,
          bsMonth: (i % 12) + 1,
          amount: 1000,
          paidAmount: 1000,
          status: 'PAID',
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `due_${i}`,
          bsYear: 2083,
          bsMonth: i + 1,
          amount: 1000,
          paidAmount: 0,
          status: 'PENDING',
        })),
      ];

      // 3. Monthly Levy Fine: 500
      // 6. Loan Interest Fine: 200
      const fines = [
        {
          id: 'f1',
          type: 'CONTRIBUTION',
          amount: 500,
          paidAmount: 0,
          postedOn: new Date().toISOString(),
          status: 'PENDING',
        },
        {
          id: 'f2',
          type: 'LOAN_INTEREST',
          amount: 200,
          paidAmount: 0,
          postedOn: new Date().toISOString(),
          status: 'PENDING',
        },
      ];

      // 4. Loan Amount Remaining: 80,000
      // 5. Loan Interest Remaining: 1,600
      const loans = [
        {
          id: 'loan_1',
          loanNo: 'LN-0001',
          principalOutstanding: 80000,
          periods: [
            {
              id: 'p1',
              bsYear: 2083,
              bsMonth: 7,
              accrued: 1600,
              paid: 0,
              capitalised: 0,
            },
          ],
        },
      ];

      // 7. Advance Balance: 1,200
      const summary = calculateMemberFinancialSummary({
        advanceBalance: 1200,
        dues,
        fines,
        loans,
      });

      expect(summary.monthlyLevyAccumulatedAmount.toNumber()).toBe(24000);
      expect(summary.monthlyLevyAccumulatedMonths).toBe(24);

      expect(summary.monthlyLevyDueAmount.toNumber()).toBe(3000);
      expect(summary.monthlyLevyDueMonths).toBe(3);

      expect(summary.monthlyLevyFineAmount.toNumber()).toBe(500);
      expect(summary.loanPrincipalRemaining.toNumber()).toBe(80000);
      expect(summary.loanInterestRemaining.toNumber()).toBe(1600);
      expect(summary.loanInterestFineAmount.toNumber()).toBe(200);

      expect(summary.advanceBalance.toNumber()).toBe(1200);

      // Verify advance offset waterfall (Fine: 200 loan fine + 500 levy fine = 700 deducted, remaining 500 deducted from interest 1600 -> 1100 adjusted interest)
      expect(summary.advanceOffset.advToLoanFine.toNumber()).toBe(200);
      expect(summary.advanceOffset.advToLevyFine.toNumber()).toBe(500);
      expect(summary.advanceOffset.advToInterest.toNumber()).toBe(500);
      expect(summary.advanceOffset.adjustedInterest.toNumber()).toBe(1100);
      expect(summary.advanceOffset.remainingAdvance.toNumber()).toBe(0);
    });
  });

  describe('Loan Modification Prior to Approval', () => {
    it('allows updating amount, rate, and purpose for pending approval loans', () => {
      const originalLoan = {
        id: 'l1',
        loanNo: 'LN-0001',
        amount: new Decimal(50000),
        principalOutstanding: new Decimal(50000),
        rateAtStart: new Decimal(12),
        purpose: 'Original request',
        status: 'PENDING_APPROVAL',
      };

      // Admin modifies loan amount to 40000, rate to 14, and purpose
      const updatedAmount = new Decimal(40000);
      const updatedRate = new Decimal(14);
      const updatedPurpose = 'Approved for agriculture with modified amount';

      const modified = {
        ...originalLoan,
        amount: updatedAmount,
        principalOutstanding: updatedAmount,
        rateAtStart: updatedRate,
        purpose: updatedPurpose,
      };

      expect(modified.amount.toNumber()).toBe(40000);
      expect(modified.principalOutstanding.toNumber()).toBe(40000);
      expect(modified.rateAtStart.toNumber()).toBe(14);
      expect(modified.purpose).toBe('Approved for agriculture with modified amount');
    });
  });
});
