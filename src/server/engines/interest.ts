import Decimal from 'decimal.js';
import { RateRecord, segmentByRate } from './rates';

export interface DailyBase {
  day: Date;
  base: Decimal;
}

export interface DailyAccrual {
  day: Date;
  accrued: Decimal;
}

/**
 * Accrue daily interest over a timeline with rate segmentation.
 * Returns per-day accrual amounts (full precision, not rounded).
 */
export function accrue(
  timeline: DailyBase[],
  rates: RateRecord[],
  basis: number = 365
): DailyAccrual[] {
  if (timeline.length === 0) return [];

  const sorted = [...timeline].sort((a, b) => a.day.getTime() - b.day.getTime());
  const from = sorted[0]!.day;
  const to = sorted[sorted.length - 1]!.day;
  const segments = segmentByRate(from, to, rates);

  const result: DailyAccrual[] = [];

  for (const entry of sorted) {
    // Find the rate for this day
    let rate = new Decimal(0);
    for (const seg of segments) {
      if (entry.day >= seg.from && entry.day <= seg.to) {
        rate = seg.ratePercent;
        break;
      }
    }

    // daily interest = base * rate / 100 / basis
    const accrued = entry.base.mul(rate).div(100).div(basis);
    result.push({ day: entry.day, accrued });
  }

  return result;
}

/**
 * Sum accrual amounts and round HALF_UP to 2 decimal places.
 */
export function sumAccrual(accruals: DailyAccrual[]): Decimal {
  const total = accruals.reduce((sum, a) => sum.plus(a.accrued), new Decimal(0));
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
