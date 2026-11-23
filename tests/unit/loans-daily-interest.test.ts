import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { generateLoanInterestPeriods } from '@/server/engines/loans';
import { adFromBs } from '@/server/engines/bs';

describe('Daily Loan Interest Calculation & Grace Period Fines', () => {
  it('accrues interest daily for current month and is not fined during grace period', () => {
    // Loan disbursed on Mangsir 1, 2083
    const disbursedOn = adFromBs(2083, 8, 1);
    // Today is Mangsir 7, 2083 (Day 7 of current month)
    const today = adFromBs(2083, 8, 7);

    const periods = generateLoanInterestPeriods(
      {
        id: 'l1',
        disbursedOn,
        principalOutstanding: 100000,
        rate: 12, // 12% p.a.
      },
      today,
      365,
      10 // 10 days grace period
    );

    // Exactly 1 period (Mangsir 2083)
    expect(periods).toHaveLength(1);
    const p = periods[0];
    expect(p.bsYear).toBe(2083);
    expect(p.bsMonth).toBe(8);

    // 7 days elapsed (Day 1 to Day 7 inclusive)
    expect(p.daysElapsed).toBe(7);

    // Accrued: 100000 * 0.12 / 365 * 7 = 230.14
    expect(p.accrued.toNumber()).toBe(230.14);

    // Not finalised yet
    expect(p.finalised).toBe(false);

    // Current month is NOT eligible for fine (graceEnd is Poush 10, 2083)
    expect(p.isEligibleForFine).toBe(false);
  });

  it('accumulates one additional day of interest on the next day', () => {
    const disbursedOn = adFromBs(2083, 8, 1);
    // Day 7
    const day7 = adFromBs(2083, 8, 7);
    const periodsDay7 = generateLoanInterestPeriods(
      { id: 'l1', disbursedOn, principalOutstanding: 100000, rate: 12 },
      day7
    );
    expect(periodsDay7[0].accrued.toNumber()).toBe(230.14);

    // Day 8 (tomorrow)
    const day8 = adFromBs(2083, 8, 8);
    const periodsDay8 = generateLoanInterestPeriods(
      { id: 'l1', disbursedOn, principalOutstanding: 100000, rate: 12 },
      day8
    );
    expect(periodsDay8[0].daysElapsed).toBe(8);
    // 100000 * 0.12 / 365 * 8 = 263.01
    expect(periodsDay8[0].accrued.toNumber()).toBe(263.01);

    // If user paid 230.14 on Day 7, remaining on Day 8 is exactly 1 day of interest: 263.01 - 230.14 = 32.87 ~ 32.88
    const diff = periodsDay8[0].accrued.minus(periodsDay7[0].accrued);
    expect(diff.toNumber()).toBeCloseTo(32.88, 1);
  });

  it('marks past months as finalised, and checks 10-day grace period for fine eligibility', () => {
    // Disbursed on Ashoj 1, 2083
    const disbursedOn = adFromBs(2083, 6, 1);
    // Today is Mangsir 7, 2083
    const today = adFromBs(2083, 8, 7);

    const periods = generateLoanInterestPeriods(
      {
        id: 'l1',
        disbursedOn,
        principalOutstanding: 50000,
        rate: 12,
      },
      today,
      365,
      10 // 10 days grace period
    );

    // Should have 3 periods: Ashoj (month 6), Kartik (month 7), Mangsir (month 8)
    expect(periods).toHaveLength(3);

    const [ashoj, kartik, mangsir] = periods;

    // 1. Ashoj: past month. GraceEnd was Kartik 10.
    // Today is Mangsir 7 > Kartik 10 -> eligible for fine!
    expect(ashoj.bsMonth).toBe(6);
    expect(ashoj.finalised).toBe(true);
    expect(ashoj.isEligibleForFine).toBe(true);

    // 2. Kartik: past month. GraceEnd is Mangsir 10.
    // Today is Mangsir 7 < Mangsir 10 -> NOT eligible for fine yet (in grace period)!
    expect(kartik.bsMonth).toBe(7);
    expect(kartik.finalised).toBe(true);
    expect(kartik.isEligibleForFine).toBe(false);

    // 3. Mangsir: current month. GraceEnd is Poush 10.
    // Not finalised, NOT eligible for fine!
    expect(mangsir.bsMonth).toBe(8);
    expect(mangsir.finalised).toBe(false);
    expect(mangsir.isEligibleForFine).toBe(false);
    expect(mangsir.daysElapsed).toBe(7);
  });
});
