import Decimal from 'decimal.js';

export interface RateSegment {
  from: Date;
  to: Date;
  ratePercent: Decimal;
}

export interface RateRecord {
  effectiveFrom: Date;
  ratePercent: Decimal;
}

/**
 * Segment a date range by rate changes.
 * Returns inclusive day ranges with the applicable rate for each segment.
 */
export function segmentByRate(
  from: Date,
  to: Date,
  history: RateRecord[]
): RateSegment[] {
  if (history.length === 0) {
    throw new Error('No rate history available');
  }

  // Sort history by effectiveFrom ascending
  const sorted = [...history].sort(
    (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime()
  );

  const segments: RateSegment[] = [];
  let current = new Date(from);

  while (current <= to) {
    // Find the rate in effect on `current`
    let rate: Decimal | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i]!.effectiveFrom <= current) {
        rate = sorted[i]!.ratePercent;
        break;
      }
    }
    if (rate === null) {
      // Use the earliest rate if current is before all rates
      rate = sorted[0]!.ratePercent;
    }

    // Find where this rate ends (next rate change or end of range)
    let segEnd = new Date(to);
    for (const r of sorted) {
      if (r.effectiveFrom > current && r.effectiveFrom <= to) {
        const dayBefore = new Date(r.effectiveFrom);
        dayBefore.setDate(dayBefore.getDate() - 1);
        if (dayBefore < segEnd) {
          segEnd = dayBefore;
        }
        break;
      }
    }

    segments.push({ from: new Date(current), to: new Date(segEnd), ratePercent: rate });

    // Move to next day after segment end
    current = new Date(segEnd);
    current.setDate(current.getDate() + 1);
  }

  return segments;
}
