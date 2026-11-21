import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { allocateContribution, fineDue } from '@/server/engines/contributions';
import { allocateLoanPayment, capitalise, validateGuarantors } from '@/server/engines/loans';
import { accrue, sumAccrual } from '@/server/engines/interest';
import { bonusPlanner, allocateDistributionLines } from '@/server/engines/calculators';
import { formatNPR } from '@/lib/format';

describe('Bachat Record - Business Rules Unit Tests (Section 15)', () => {
  // -------------------------------------------------------------------------
  // T1. Contribution fines (3.4, 3.5)
  // Monthly 1,000, grace day 10, fine 200.
  // - Bhadra due 1,000 is unpaid. On Ashoj 10, no fine yet. On Ashoj 11 one fine of 200 is posted for Bhadra.
  // - Member should pay 2,200 in Ashoj (Bhadra 1,000 + Bhadra fine 200 + Ashoj 1,000).
  // - Member pays 1,000 in Ashoj. Applied to Bhadra due. Bhadra due = PAID. Bhadra fine 200 stays pending.
  // - On Kartik 11: Ashoj due is unpaid, so one fine of 200 is posted for Ashoj. No second fine for Bhadra.
  // - Result in Kartik: pending contributions 2,000 (Ashoj 1,000 + Kartik 1,000), pending fines 400. Total = 2,400.
  // - Variant: if Bhadra is paid on Ashoj 8, no Bhadra fine ever exists.
  // -------------------------------------------------------------------------
  describe('T1. Contribution fines & allocation', () => {
    it('does not post fine on or before grace day, posts exactly one fine after grace day', () => {
      const graceEnd = new Date('2026-09-26'); // Example Ashoj 10
      const ashoj10 = new Date('2026-09-26');
      const ashoj11 = new Date('2026-09-27');

      const due = {
        id: 'due-bhadra',
        memberId: 'm1',
        amount: new Decimal(1000),
        paidAmount: new Decimal(0),
        graceEnd,
      };

      // Ashoj 10: no fine
      expect(fineDue(due, ashoj10, 200)).toBeNull();

      // Ashoj 11: one fine of 200
      const fine = fineDue(due, ashoj11, 200);
      expect(fine).not.toBeNull();
      expect(fine?.amount.toNumber()).toBe(200);
      expect(fine?.contributionDueId).toBe('due-bhadra');

      // Variant: if paid on Ashoj 8
      const paidDue = { ...due, paidAmount: new Decimal(1000) };
      expect(fineDue(paidDue, ashoj11, 200)).toBeNull();
    });

    it('allocates payment to oldest due first, then oldest fine, then advance', () => {
      const dues = [
        { id: 'bhadra', bsYear: 2083, bsMonth: 5, amount: 1000, paidAmount: 0 },
        { id: 'ashoj', bsYear: 2083, bsMonth: 6, amount: 1000, paidAmount: 0 },
      ];
      const fines = [
        { id: 'fine-bhadra', amount: 200, paidAmount: 0, postedOn: new Date('2026-09-27') },
      ];

      // Member pays 1,000 in Ashoj -> allocated completely to Bhadra due
      const res = allocateContribution(1000, dues, fines);
      expect(res.allocations).toHaveLength(1);
      expect(res.allocations[0]!.target).toBe('CONTRIBUTION_DUE');
      expect(res.allocations[0]!.dueId).toBe('bhadra');
      expect(res.allocations[0]!.amount.toNumber()).toBe(1000);
      expect(res.totalAllocatedToFines.toNumber()).toBe(0);

      // If member pays 2,200 -> Bhadra due (1000) + Ashoj due (1000) + Bhadra fine (200)
      const resFull = allocateContribution(2200, dues, fines);
      expect(resFull.totalAllocatedToDues.toNumber()).toBe(2000);
      expect(resFull.totalAllocatedToFines.toNumber()).toBe(200);
      expect(resFull.newAdvanceBalance.toNumber()).toBe(0);

      // If member pays 2,500 -> 2000 dues + 200 fine + 300 advance
      const resAdvance = allocateContribution(2500, dues, fines);
      expect(resAdvance.newAdvanceBalance.toNumber()).toBe(300);
    });
  });

  // -------------------------------------------------------------------------
  // T2. Loan payment allocation (3.11)
  // Principal 5,000, interest due 1,000, no fine. Pay 1,500: interest -> 0, principal -> 4,500.
  // With fine 100: pay 1,500 -> fine 100, interest 1,000, principal 400.
  // Overpayment rejected.
  // -------------------------------------------------------------------------
  describe('T2. Loan payment allocation', () => {
    it('allocates interest -> 0, principal -> 4,500 on 1,500 payment with no fine', () => {
      const periods = [
        { id: 'p1', bsYear: 2083, bsMonth: 4, accrued: 1000, paid: 0, capitalised: 0, finalised: true },
      ];
      const res = allocateLoanPayment(1500, [], periods, 0, 5000);
      expect(res.allocatedInterest.toNumber()).toBe(1000);
      expect(res.allocatedPrincipal.toNumber()).toBe(500);
      expect(res.remainingPrincipal.toNumber()).toBe(4500);
    });

    it('allocates fine 100, interest 1,000, principal 400 on 1,500 payment with fine', () => {
      const fines = [
        { id: 'f1', amount: 100, paidAmount: 0, postedOn: new Date('2026-09-01') },
      ];
      const periods = [
        { id: 'p1', bsYear: 2083, bsMonth: 4, accrued: 1000, paid: 0, capitalised: 0, finalised: true },
      ];
      const res = allocateLoanPayment(1500, fines, periods, 0, 5000);
      expect(res.allocatedFines.toNumber()).toBe(100);
      expect(res.allocatedInterest.toNumber()).toBe(1000);
      expect(res.allocatedPrincipal.toNumber()).toBe(400);
      expect(res.remainingPrincipal.toNumber()).toBe(4600);
    });

    it('rejects overpayment exceeding total owed', () => {
      const periods = [
        { id: 'p1', bsYear: 2083, bsMonth: 4, accrued: 1000, paid: 0, capitalised: 0, finalised: true },
      ];
      // total owed = 5000 + 1000 = 6000. Paying 6001 should throw.
      expect(() => allocateLoanPayment(6001, [], periods, 0, 5000)).toThrow(
        /exceeds total amount owed/
      );
    });
  });

  // -------------------------------------------------------------------------
  // T3. Interest to principal (3.7)
  // Principal 5,000, unpaid interest 1,000.
  // Convert: principal 6,000, interest due 0, event CAPITALISE.
  // -------------------------------------------------------------------------
  describe('T3. Interest to principal capitalise', () => {
    it('capitalises unpaid interest into principal', () => {
      const periods = [
        { id: 'p1', accrued: new Decimal(1000), paid: new Decimal(0), capitalised: new Decimal(0) },
      ];
      const res = capitalise(5000, periods, 1000);
      expect(res.newPrincipal.toNumber()).toBe(6000);
      expect(res.totalCapitalised.toNumber()).toBe(1000);
      expect(res.periodUpdates[0]!.addCapitalised.toNumber()).toBe(1000);
    });
  });

  // -------------------------------------------------------------------------
  // T4. Daily savings interest
  // Base 33,000 at 10%: day = 9.041095..., 30 days = 271.23 (half-up).
  // -------------------------------------------------------------------------
  describe('T4. Daily savings interest', () => {
    it('calculates 30 days of 33,000 at 10% basis 365 = 271.23', () => {
      const timeline = [];
      const baseDate = new Date('2026-01-01');
      for (let i = 0; i < 30; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        timeline.push({ day: d, base: new Decimal(33000) });
      }

      const rates = [
        { effectiveFrom: new Date('2025-01-01'), ratePercent: new Decimal(10) },
      ];

      const dailyAccruals = accrue(timeline, rates, 365);
      expect(dailyAccruals).toHaveLength(30);

      // Verify unrounded daily is ~9.04109589
      expect(dailyAccruals[0]!.accrued.toFixed(6)).toBe('9.041096');

      // Sum rounded half-up
      const total = sumAccrual(dailyAccruals);
      expect(total.toNumber()).toBe(271.23);
    });
  });

  // -------------------------------------------------------------------------
  // T5. Mid-period rate change
  // Base 33,000: 10% for 10 days then 12% for 20 days = 90.4110 + 216.9863 = 307.40
  // -------------------------------------------------------------------------
  describe('T5. Mid-period rate change', () => {
    it('segments rate and calculates 307.40', () => {
      const timeline = [];
      const baseDate = new Date('2026-01-01');
      for (let i = 0; i < 30; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        timeline.push({ day: d, base: new Decimal(33000) });
      }

      const rates = [
        { effectiveFrom: new Date('2025-01-01'), ratePercent: new Decimal(10) },
        { effectiveFrom: new Date('2026-01-11'), ratePercent: new Decimal(12) }, // day 11 is index 10 (starts day 11)
      ];

      const dailyAccruals = accrue(timeline, rates, 365);
      const total = sumAccrual(dailyAccruals);
      expect(total.toNumber()).toBe(307.40);
    });
  });

  // -------------------------------------------------------------------------
  // T9. Bonus planner (3.10)
  // Net profit 94,500, reserve 20% = 18,900, distributable 75,600, bonus base 12,40,000:
  // suggested 6.0968% (shown 6.10%).
  // Choosing 7% shows a shortfall; with allowReserveDraw on, reserve falls; below reserveFloor confirm blocked.
  // -------------------------------------------------------------------------
  describe('T9. Bonus planner', () => {
    it('calculates suggested bonus 6.0968% from net profit 94,500 and reserve 20%', () => {
      const res = bonusPlanner({
        realizedIncome: 94500,
        expenses: 0,
        pastDistributionsInWindow: 0,
        bonusBase: 1240000,
        reservePercent: 20,
        allowReserveDraw: true,
        reserveFloor: 0,
        cashOnHand: 100000,
      });

      expect(res.realizedNetProfit.toNumber()).toBe(94500);
      expect(res.reserve.toNumber()).toBe(18900);
      expect(res.distributable.toNumber()).toBe(75600);
      expect(res.suggestedBonusPct.toFixed(4)).toBe('6.0968');
      expect(res.canConfirm).toBe(true);
    });

    it('shows shortfall and allows reserve draw when 7% is chosen, blocks if floor breached', () => {
      const res = bonusPlanner({
        realizedIncome: 94500,
        expenses: 0,
        pastDistributionsInWindow: 0,
        bonusBase: 1240000,
        reservePercent: 20,
        chosenPercent: 7,
        allowReserveDraw: true,
        reserveFloor: 15000, // floor is 15,000
        cashOnHand: 100000,
      });

      // 7% on 12,40,000 = 86,800
      expect(res.chosenBonusAmount.toNumber()).toBe(86800);
      // shortfall = 86,800 - 75,600 = 11,200
      expect(res.shortfall.toNumber()).toBe(11200);
      // reserveAfter = 18,900 - 11,200 = 7,700
      expect(res.reserveAfter.toNumber()).toBe(7700);
      // Since 7,700 < 15,000 floor, isFloorBreached = true and canConfirm = false
      expect(res.isFloorBreached).toBe(true);
      expect(res.canConfirm).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // T10. Distribution integrity
  // Lines sum exactly to the total.
  // -------------------------------------------------------------------------
  describe('T10. Distribution integrity', () => {
    it('ensures distribution lines sum exactly to total with rounding assigned to largest line', () => {
      const targetTotal = 10000;
      const bases = [
        { memberId: 'm1', base: new Decimal(3333.33) },
        { memberId: 'm2', base: new Decimal(3333.33) },
        { memberId: 'm3', base: new Decimal(3333.34) },
      ];

      const lines = allocateDistributionLines(targetTotal, bases);
      const sum = lines.reduce((acc, l) => acc.plus(l.amount), new Decimal(0));
      expect(sum.toNumber()).toBe(10000);
    });
  });

  // -------------------------------------------------------------------------
  // T11. Guarantor validation (3.6)
  // Exactly 3, all active, all different, none borrower.
  // -------------------------------------------------------------------------
  describe('T11. Guarantor validation', () => {
    const active = new Set(['m1', 'm2', 'm3', 'm4', 'm5']);

    it('accepts exactly 3 valid distinct active non-borrower guarantors', () => {
      const val = validateGuarantors('m1', ['m2', 'm3', 'm4'], active);
      expect(val.valid).toBe(true);
    });

    it('rejects fewer than 3 guarantors', () => {
      const val = validateGuarantors('m1', ['m2', 'm3'], active);
      expect(val.valid).toBe(false);
      expect(val.error).toMatch(/exactly 3/);
    });

    it('rejects borrower as guarantor', () => {
      const val = validateGuarantors('m1', ['m1', 'm2', 'm3'], active);
      expect(val.valid).toBe(false);
      expect(val.error).toMatch(/Borrower cannot/);
    });

    it('rejects duplicate guarantors', () => {
      const val = validateGuarantors('m1', ['m2', 'm2', 'm3'], active);
      expect(val.valid).toBe(false);
      expect(val.error).toMatch(/must be different/);
    });

    it('rejects non-active member as guarantor', () => {
      const val = validateGuarantors('m1', ['m2', 'm3', 'closed_m'], active);
      expect(val.valid).toBe(false);
      expect(val.error).toMatch(/ACTIVE/);
    });
  });

  // -------------------------------------------------------------------------
  // Format check
  // -------------------------------------------------------------------------
  describe('Nepali digit formatting', () => {
    it('formats numbers with Nepali digit grouping', () => {
      expect(formatNPR(1240000)).toBe('NPR 12,40,000.00');
      expect(formatNPR(1000)).toBe('NPR 1,000.00');
      expect(formatNPR(100000)).toBe('NPR 1,00,000.00');
    });
  });
});
