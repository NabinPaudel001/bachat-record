import NepaliDate from 'nepali-date-converter';

export interface BSDate {
  year: number;
  month: number;
  day: number;
}

/** Convert AD date to BS date */
export function bsFromAd(date: Date): BSDate {
  const nd = new NepaliDate(date);
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
}

/** Convert BS date to AD date */
export function adFromBs(year: number, month: number, day: number): Date {
  const nd = new NepaliDate(year, month - 1, day);
  return nd.toJsDate();
}

/** Get the AD date range for a BS month */
export function bsMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = adFromBs(year, month, 1);
  // Get the last day by going to next month day 1 and subtracting 1 day
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextYear++;
    nextMonth = 1;
  }
  const nextStart = adFromBs(nextYear, nextMonth, 1);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
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

/** Get today in Nepal timezone */
export function todayNPT(): Date {
  const now = new Date();
  // Format in Asia/Kathmandu to get the date string, then parse back
  const nptStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
  return new Date(nptStr + 'T00:00:00');
}

/** Get today's BS date */
export function todayBS(): BSDate {
  return bsFromAd(todayNPT());
}

/** Get the number of days in a BS month */
export function bsMonthDays(year: number, month: number): number {
  const { start, end } = bsMonthRange(year, month);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
