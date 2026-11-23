'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import NepaliDate from 'nepali-date-converter';
import { Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const;

export const BS_MONTHS_NEPALI = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'असोज',
  'कार्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत',
] as const;

const WEEKDAYS = [
  { en: 'Su', ne: 'आइत', name: 'Sunday', isHoliday: false },
  { en: 'Mo', ne: 'सोम', name: 'Monday', isHoliday: false },
  { en: 'Tu', ne: 'मंगल', name: 'Tuesday', isHoliday: false },
  { en: 'We', ne: 'बुध', name: 'Wednesday', isHoliday: false },
  { en: 'Th', ne: 'बिही', name: 'Thursday', isHoliday: false },
  { en: 'Fr', ne: 'शुक्र', name: 'Friday', isHoliday: false },
  { en: 'Sa', ne: 'शनि', name: 'Saturday', isHoliday: true },
];

/** Return total days in given BS month of given BS year */
export function getBsDaysInMonth(year: number, month: number): number {
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
    return 30;
  }
}

/** Return day of week (0=Sun, 6=Sat) for 1st day of given BS month */
export function getBsFirstDayOfWeek(year: number, month: number): number {
  try {
    const clampedYear = Math.max(2000, Math.min(2090, year));
    const clampedMonth = Math.max(1, Math.min(12, month));
    const nd = new NepaliDate(clampedYear, clampedMonth - 1, 1);
    return nd.getDay();
  } catch {
    return 0;
  }
}

/** Convert BS date to accurate English AD ISO date string (YYYY-MM-DD) */
export function bsToAdString(year: number, month: number, day: number): string {
  try {
    const clampedYear = Math.max(2000, Math.min(2090, year));
    const clampedMonth = Math.max(1, Math.min(12, month));
    const daysInM = getBsDaysInMonth(clampedYear, clampedMonth);
    const clampedDay = Math.max(1, Math.min(daysInM, day));
    const nd = new NepaliDate(clampedYear, clampedMonth - 1, clampedDay);
    const ad = nd.getAD();
    return `${ad.year}-${String(ad.month + 1).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** Convert AD date (string or Date) to BS date components */
export function adToBsDate(input: string | Date | undefined | null): { year: number; month: number; day: number } | null {
  if (!input) return null;
  try {
    let d: Date;
    if (typeof input === 'string') {
      const trimmed = input.split('T')[0].trim();
      const parts = trimmed.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        // If year is in BS range (>2050), it is already BS date
        if (parts[0] >= 2000 && parts[0] <= 2090 && parts[1] >= 1 && parts[1] <= 12) {
          if (parts[0] > 2050) {
            return { year: parts[0], month: parts[1], day: parts[2] };
          }
        }
        d = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        d = new Date(input);
      }
    } else {
      d = new Date(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate());
    }
    const nd = new NepaliDate(d);
    return {
      year: nd.getYear(),
      month: nd.getMonth() + 1,
      day: nd.getDate(),
    };
  } catch {
    return null;
  }
}

/** Get today's BS date */
export function getTodayBS(): { year: number; month: number; day: number } {
  try {
    const now = new Date();
    const nptStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
    const parts = nptStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const nd = new NepaliDate(d);
    return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
  } catch {
    const nd = new NepaliDate();
    return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
  }
}

export interface NepaliDatePickerProps {
  name: string;
  label?: string;
  value?: string;
  defaultBsYear?: number;
  defaultBsMonth?: number;
  defaultBsDay?: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  popoverAlign?: 'left' | 'center' | 'right';
  onChange?: (adDate: string, bsYear: number, bsMonth: number, bsDay: number, bsFormatted: string) => void;
}

export function NepaliDatePicker({
  name,
  label,
  value,
  defaultBsYear,
  defaultBsMonth,
  defaultBsDay,
  required = false,
  disabled = false,
  placeholder = 'Select Nepali Date',
  className = '',
  popoverAlign = 'left',
  onChange,
}: NepaliDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Initialize today
  const todayBS = useMemo(() => getTodayBS(), []);

  // Compute initial selected date
  const initialDate = useMemo(() => {
    if (value) {
      const parsed = adToBsDate(value);
      if (parsed) return parsed;
    }
    if (defaultBsYear && defaultBsMonth && defaultBsDay) {
      return { year: defaultBsYear, month: defaultBsMonth, day: defaultBsDay };
    }
    return todayBS;
  }, [value, defaultBsYear, defaultBsMonth, defaultBsDay, todayBS]);

  const [selectedBs, setSelectedBs] = useState<{ year: number; month: number; day: number } | null>(initialDate);
  const [viewYear, setViewYear] = useState<number>(initialDate?.year ?? todayBS.year);
  const [viewMonth, setViewMonth] = useState<number>(initialDate?.month ?? todayBS.month);

  // Synchronize when external value changes
  useEffect(() => {
    if (value) {
      const parsed = adToBsDate(value);
      if (parsed) {
        setSelectedBs(parsed);
        setViewYear(parsed.year);
        setViewMonth(parsed.month);
      }
    }
  }, [value]);

  // Notify parent on initial mount if controlled onChange is provided and date is selected
  const hasNotifiedInitial = useRef(false);
  useEffect(() => {
    if (!hasNotifiedInitial.current && selectedBs) {
      hasNotifiedInitial.current = true;
      const ad = bsToAdString(selectedBs.year, selectedBs.month, selectedBs.day);
      const bsFmt = `${selectedBs.year}-${String(selectedBs.month).padStart(2, '0')}-${String(selectedBs.day).padStart(2, '0')}`;
      onChange?.(ad, selectedBs.year, selectedBs.month, selectedBs.day, bsFmt);
    }
  }, [selectedBs, onChange]);

  // Click outside listener to close calendar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Derived values for the current view
  const daysInMonth = useMemo(() => getBsDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const firstDayOfWeek = useMemo(() => getBsFirstDayOfWeek(viewYear, viewMonth), [viewYear, viewMonth]);

  // Currently selected AD date
  const adDate = useMemo(() => {
    if (!selectedBs) return '';
    return bsToAdString(selectedBs.year, selectedBs.month, selectedBs.day);
  }, [selectedBs]);

  const bsFormatted = useMemo(() => {
    if (!selectedBs) return '';
    return `${selectedBs.year}-${String(selectedBs.month).padStart(2, '0')}-${String(selectedBs.day).padStart(2, '0')}`;
  }, [selectedBs]);

  // Month navigation
  function handlePrevMonth() {
    if (viewMonth === 1) {
      if (viewYear > 2000) {
        setViewYear((y) => y - 1);
        setViewMonth(12);
      }
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 12) {
      if (viewYear < 2090) {
        setViewYear((y) => y + 1);
        setViewMonth(1);
      }
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Day selection
  function handleSelectDay(day: number) {
    const newBs = { year: viewYear, month: viewMonth, day };
    setSelectedBs(newBs);
    const ad = bsToAdString(viewYear, viewMonth, day);
    const fmt = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange?.(ad, viewYear, viewMonth, day, fmt);
    setIsOpen(false);
  }

  // Jump to Today
  function handleSelectToday() {
    setSelectedBs(todayBS);
    setViewYear(todayBS.year);
    setViewMonth(todayBS.month);
    const ad = bsToAdString(todayBS.year, todayBS.month, todayBS.day);
    const fmt = `${todayBS.year}-${String(todayBS.month).padStart(2, '0')}-${String(todayBS.day).padStart(2, '0')}`;
    onChange?.(ad, todayBS.year, todayBS.month, todayBS.day, fmt);
    setIsOpen(false);
  }

  // Available year options (2000 to 2090)
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = 2000; y <= 2090; y++) list.push(y);
    return list;
  }, []);

  return (
    <div ref={containerRef} className={`relative space-y-1 ${className}`}>
      {label && (
        <label className="text-xs font-semibold flex items-center justify-between">
          <span>
            {label} {required && <span className="text-rose-500">*</span>}
          </span>
          {adDate && (
            <span className="text-[11px] font-mono font-normal text-muted-foreground">
              AD: {adDate}
            </span>
          )}
        </label>
      )}

      {/* Trigger Input */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm flex items-center justify-between text-left shadow-xs hover:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring transition-colors"
      >
        <span className={selectedBs ? 'font-medium text-foreground' : 'text-muted-foreground'}>
          {selectedBs ? (
            <>
              {bsFormatted} <span className="text-muted-foreground font-normal">({BS_MONTHS[selectedBs.month - 1]} {selectedBs.day})</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>

      {/* Hidden inputs for form data submission */}
      <input type="hidden" name={name} value={adDate} />
      <input type="hidden" name={`${name}Bs`} value={bsFormatted} />

      {/* Popover Calendar */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Nepali Date Picker"
          className={`absolute top-full mt-1.5 z-50 w-[300px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 ${
            popoverAlign === 'center'
              ? 'left-1/2 -translate-x-1/2'
              : popoverAlign === 'right'
              ? 'right-0 left-auto'
              : 'left-0'
          }`}
        >
          {/* Header: Month and Year Selector + Prev/Next Controls */}
          <div className="flex items-center justify-between gap-1 mb-2.5 pb-2 border-b border-border">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous Month"
              className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {/* Month Dropdown */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                {BS_MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m} ({BS_MONTHS_NEPALI[idx]})
                  </option>
                ))}
              </select>

              {/* Year Dropdown */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y} BS
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next Month"
              className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Names Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w.en}
                title={w.name}
                className={`text-[11px] font-semibold py-0.5 ${
                  w.isHoliday ? 'text-rose-500 font-bold' : 'text-muted-foreground'
                }`}
              >
                {w.en}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Blank offset cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-7 w-7" />
            ))}

            {/* Day buttons */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                selectedBs?.year === viewYear &&
                selectedBs?.month === viewMonth &&
                selectedBs?.day === day;
              const isToday =
                todayBS.year === viewYear &&
                todayBS.month === viewMonth &&
                todayBS.day === day;
              const dayOfWeek = (firstDayOfWeek + i) % 7;
              const isSaturday = dayOfWeek === 6;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 w-7 text-xs rounded-md flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : isToday
                      ? 'border border-primary font-bold text-primary hover:bg-accent'
                      : isSaturday
                      ? 'text-rose-600 hover:bg-accent font-medium'
                      : 'text-foreground hover:bg-accent font-normal'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Bar: Quick action & dual conversion info */}
          <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Today (आज)
            </button>
            <div className="text-[10px] text-muted-foreground font-mono">
              {viewYear}-{String(viewMonth).padStart(2, '0')}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
