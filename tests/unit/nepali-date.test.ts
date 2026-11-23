import { describe, it, expect } from 'vitest';
import { bsFromAd, adFromBs, adStringFromBs, bsMonthRange, bsMonthDays } from '@/server/engines/bs';
import { bsToAdString, adToBsDate, getBsDaysInMonth, getBsFirstDayOfWeek } from '@/components/ui/nepali-date-picker';
import { formatBSDate } from '@/lib/format';

describe('Nepali Date Engine and Picker Tests', () => {
  it('accurately converts BS to English AD date string without 1-day timezone offset', () => {
    // 2081 Mangsir 1 is 2024 November 16
    const ad1 = bsToAdString(2081, 8, 1);
    expect(ad1).toBe('2024-11-16');

    // 2081 Baisakh 1 is 2024 April 13
    const ad2 = bsToAdString(2081, 1, 1);
    expect(ad2).toBe('2024-04-13');

    // 2083 Mangsir 5 is 2026 November 21
    const ad3 = bsToAdString(2083, 8, 5);
    expect(ad3).toBe('2026-11-21');
  });

  it('performs 100% accurate round-trip conversion between BS and AD across various years', () => {
    const testCases = [
      { bsY: 2083, bsM: 8, bsD: 5, expectedAd: '2026-11-21' },
      { bsY: 2081, bsM: 8, bsD: 1, expectedAd: '2024-11-16' },
      { bsY: 2081, bsM: 1, bsD: 1, expectedAd: '2024-04-13' },
      { bsY: 2080, bsM: 12, bsD: 30, expectedAd: '2024-04-12' },
      { bsY: 2070, bsM: 5, bsD: 15, expectedAd: '2013-08-31' },
      { bsY: 2035, bsM: 10, bsD: 1, expectedAd: '1979-01-15' },
      { bsY: 2005, bsM: 3, bsD: 31, expectedAd: '1948-07-14' },
    ];

    for (const { bsY, bsM, bsD, expectedAd } of testCases) {
      // BS -> AD
      const ad = bsToAdString(bsY, bsM, bsD);
      expect(ad).toBe(expectedAd);

      // AD -> BS
      const bs = adToBsDate(ad);
      expect(bs).not.toBeNull();
      expect(bs?.year).toBe(bsY);
      expect(bs?.month).toBe(bsM);
      expect(bs?.day).toBe(bsD);

      // Server engine adFromBs & bsFromAd
      const serverAd = adFromBs(bsY, bsM, bsD);
      const serverAdStr = adStringFromBs(bsY, bsM, bsD);
      expect(serverAdStr).toBe(expectedAd);
      expect(serverAd.toISOString().split('T')[0]).toBe(expectedAd);

      const serverBs = bsFromAd(serverAd);
      expect(serverBs.year).toBe(bsY);
      expect(serverBs.month).toBe(bsM);
      expect(serverBs.day).toBe(bsD);
    }
  });

  it('accurately computes days in month and starting day of week for BS calendar grid', () => {
    // 2081 Mangsir (Month 8) has 30 days
    expect(getBsDaysInMonth(2081, 8)).toBe(30);
    // 2081 Baisakh (Month 1) has 31 days
    expect(getBsDaysInMonth(2081, 1)).toBe(31);
    // 2081 Jestha (Month 2) has 32 days
    expect(getBsDaysInMonth(2081, 2)).toBe(32);

    // 2083 Mangsir 1 day of week: Tuesday (2)
    expect(getBsFirstDayOfWeek(2083, 8)).toBe(2);
    // 2081 Mangsir 1 day of week: Saturday (6)
    expect(getBsFirstDayOfWeek(2081, 8)).toBe(6);
  });

  it('correctly handles bsMonthRange and bsMonthDays in server engine', () => {
    const range = bsMonthRange(2081, 8);
    expect(range.start.toISOString().split('T')[0]).toBe('2024-11-16');
    expect(range.end.toISOString().split('T')[0]).toBe('2024-12-15');
    expect(bsMonthDays(2081, 8)).toBe(30);
  });

  it('correctly formats display BS date with UTC-safe AD date', () => {
    const adDate = new Date('2024-11-16T00:00:00.000Z');
    const formatted = formatBSDate(2081, 8, 1, adDate);
    expect(formatted).toBe('2081-08-01 BS (2024-11-16)');
  });
});
