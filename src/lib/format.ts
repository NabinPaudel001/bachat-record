import Decimal from 'decimal.js';

/** Format NPR with Nepali digit grouping: 12,40,000 */
export function formatNPR(amount: Decimal | string | number): string {
  const d = new Decimal(amount);
  const isNeg = d.isNegative();
  const abs = d.abs().toFixed(2);
  const [intPart, decPart] = abs.split('.');

  // Nepali grouping: last 3 digits, then groups of 2
  let result = '';
  const digits = intPart!;
  if (digits.length <= 3) {
    result = digits;
  } else {
    result = digits.slice(-3);
    let remaining = digits.slice(0, -3);
    while (remaining.length > 2) {
      result = remaining.slice(-2) + ',' + result;
      remaining = remaining.slice(0, -2);
    }
    if (remaining.length > 0) {
      result = remaining + ',' + result;
    }
  }

  return `${isNeg ? '-' : ''}NPR ${result}.${decPart}`;
}

/** Format BS date display: 2083-07-19 BS (2026-11-05) */
export function formatBSDate(bsYear: number, bsMonth: number, bsDay: number, adDate?: Date): string {
  const bsPart = `${bsYear}-${String(bsMonth).padStart(2, '0')}-${String(bsDay).padStart(2, '0')} BS`;
  if (adDate) {
    const adPart = adDate.toISOString().split('T')[0];
    return `${bsPart} (${adPart})`;
  }
  return bsPart;
}

/** BS month names */
export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const;

export function bsMonthName(month: number): string {
  return BS_MONTHS[month - 1] ?? `Month ${month}`;
}
