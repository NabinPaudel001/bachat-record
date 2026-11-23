import NepaliDate from 'nepali-date-converter';

export interface BSDate {
  year: number;
  month: number;
  day: number;
}

/** Convert AD date to BS date accurately and immune to timezone shifts */
export function bsFromAd(date: Date | string): BSDate {
  let d: Date;
  if (typeof date === 'string') {
    const trimmed = date.split('T')[0].trim();
    const parts = trimmed.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(date);
    }
  } else {
    // If it is a Date object (e.g. from Prisma @db.Date), use UTC date components to avoid midnight shifts
    d = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  const nd = new NepaliDate(d);
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
}

/** Convert BS date to accurate AD Date (UTC midnight) */
export function adFromBs(year: number, month: number, day: number): Date {
  const clampedYear = Math.max(2000, Math.min(2090, year));
  const clampedMonth = Math.max(1, Math.min(12, month));
  const nd = new NepaliDate(clampedYear, clampedMonth - 1, day);
  const ad = nd.getAD();
  return new Date(Date.UTC(ad.year, ad.month, ad.date));
}

/** Convert BS date to AD ISO string YYYY-MM-DD */
export function adStringFromBs(year: number, month: number, day: number): string {
  const clampedYear = Math.max(2000, Math.min(2090, year));
  const clampedMonth = Math.max(1, Math.min(12, month));
  const nd = new NepaliDate(clampedYear, clampedMonth - 1, day);
  const ad = nd.getAD();
  return `${ad.year}-${String(ad.month + 1).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`;
}

/** Get the AD date range for a BS month */
export function bsMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = adFromBs(year, month, 1);
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextYear++;
    nextMonth = 1;
  }
  const nextStart = adFromBs(nextYear, nextMonth, 1);
  const end = new Date(nextStart);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start, end };
}

/** Get the grace end date: day `graceDay` of BS month M+1 */
export function graceEndOf(year: number, month: number, graceDay: number): Date {
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextYear++;
    nextMonth = 1;
  }
  return adFromBs(nextYear, nextMonth, graceDay);
}

/** Get today in Nepal timezone (UTC midnight Date) */
export function todayNPT(): Date {
  const now = new Date();
  const nptStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
  const parts = nptStr.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

/** Get today's BS date */
export function todayBS(): BSDate {
  return bsFromAd(todayNPT());
}

/** Get the number of days in a BS month */
export function bsMonthDays(year: number, month: number): number {
  try {
    const clampedYear = Math.max(2000, Math.min(2090, year));
    const clampedMonth = Math.max(1, Math.min(12, month));
    const d1 = new NepaliDate(clampedYear, clampedMonth - 1, 1).getAD();
    let nextYear = clampedYear;
    let nextMonth = clampedMonth + 1;
    if (nextMonth > 12) {
      nextYear++;
      nextMonth = 1;
    }
    const d2 = new NepaliDate(nextYear, nextMonth - 1, 1).getAD();
    const t1 = Date.UTC(d1.year, d1.month, d1.date);
    const t2 = Date.UTC(d2.year, d2.month, d2.date);
    return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
  } catch {
    const { start, end } = bsMonthRange(year, month);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
}
