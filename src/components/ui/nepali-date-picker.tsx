'use client';

import { useState, useMemo } from 'react';
import NepaliDate from 'nepali-date-converter';

const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const;

function getBsDaysInMonth(year: number, month: number): number {
  try {
    const start = new NepaliDate(year, month - 1, 1).toJsDate();
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) { nextYear++; nextMonth = 1; }
    const end = new NepaliDate(nextYear, nextMonth - 1, 1).toJsDate();
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 32;
  }
}

function bsToAd(year: number, month: number, day: number): string {
  try {
    const nd = new NepaliDate(year, month - 1, day);
    return nd.toJsDate().toISOString().split('T')[0];
  } catch {
    return '';
  }
}

interface NepaliDatePickerProps {
  name: string;
  label?: string;
  defaultBsYear?: number;
  defaultBsMonth?: number;
  defaultBsDay?: number;
  required?: boolean;
  onChange?: (adDate: string, bsYear: number, bsMonth: number, bsDay: number) => void;
}

export function NepaliDatePicker({
  name,
  label,
  defaultBsYear,
  defaultBsMonth,
  defaultBsDay,
  required = false,
  onChange,
}: NepaliDatePickerProps) {
  const today = useMemo(() => {
    try {
      const nd = new NepaliDate();
      return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
    } catch {
      return { year: 2083, month: 7, day: 1 };
    }
  }, []);

  const [bsYear, setBsYear] = useState(defaultBsYear ?? today.year);
  const [bsMonth, setBsMonth] = useState(defaultBsMonth ?? today.month);
  const [bsDay, setBsDay] = useState(defaultBsDay ?? today.day);

  const daysInMonth = useMemo(() => getBsDaysInMonth(bsYear, bsMonth), [bsYear, bsMonth]);
  const clampedDay = Math.min(bsDay, daysInMonth);
  const adDate = useMemo(() => bsToAd(bsYear, bsMonth, clampedDay), [bsYear, bsMonth, clampedDay]);

  function handleChange(newYear: number, newMonth: number, newDay: number) {
    const days = getBsDaysInMonth(newYear, newMonth);
    const cDay = Math.min(newDay, days);
    setBsYear(newYear);
    setBsMonth(newMonth);
    setBsDay(cDay);
    const ad = bsToAd(newYear, newMonth, cDay);
    onChange?.(ad, newYear, newMonth, cDay);
  }

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = 2050; y <= 2100; y++) arr.push(y);
    return arr;
  }, []);

  const days = useMemo(() => {
    const arr: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [daysInMonth]);

  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-semibold">{label} {required && '*'}</label>}
      <div className="flex items-center gap-2">
        <select
          value={bsYear}
          onChange={(e) => handleChange(Number(e.target.value), bsMonth, bsDay)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={bsMonth}
          onChange={(e) => handleChange(bsYear, Number(e.target.value), bsDay)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1"
        >
          {BS_MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={clampedDay}
          onChange={(e) => handleChange(bsYear, bsMonth, Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm w-20"
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      {adDate && (
        <p className="text-[10px] text-muted-foreground">
          BS {bsYear}-{String(bsMonth).padStart(2, '0')}-{String(clampedDay).padStart(2, '0')} → AD {adDate}
        </p>
      )}
      <input type="hidden" name={name} value={adDate} />
      <input type="hidden" name={`${name}Bs`} value={`${bsYear}-${bsMonth}-${clampedDay}`} />
    </div>
  );
}
