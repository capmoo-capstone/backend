import { DAY_MS } from './constant';
import {
  addBangkokDays,
  bangkokDayStartUtc,
  bangkokWeekday,
  formatBangkokDate,
} from './date';

export type BangkokWorkingDayHolidayIndex = {
  weekdayHolidayDates: string[];
};

export const isBangkokWeekend = (date: Date): boolean => {
  const day = bangkokWeekday(date);
  return day === 0 || day === 6;
};

export const createBangkokWorkingDayHolidayIndex = (
  holidayDates: Set<string> | BangkokWorkingDayHolidayIndex
): BangkokWorkingDayHolidayIndex => {
  if (
    holidayDates &&
    typeof holidayDates === 'object' &&
    'weekdayHolidayDates' in holidayDates
  ) {
    return holidayDates;
  }

  const sortedWeekdayHolidays: string[] = [];
  if (holidayDates instanceof Set) {
    for (const dateStr of holidayDates) {
      const d = new Date(`${dateStr}T00:00:00.000+07:00`);
      if (!isBangkokWeekend(d)) {
        sortedWeekdayHolidays.push(dateStr);
      }
    }
    sortedWeekdayHolidays.sort();
  }

  return { weekdayHolidayDates: sortedWeekdayHolidays };
};

/** Calculates number of weekend days (Saturday & Sunday) in O(1) time. */
export const countBangkokWeekendDays = (
  startWeekday: number,
  calendarDays: number
): number => {
  const fullWeeks = Math.floor(calendarDays / 7);
  const remainder = calendarDays % 7;

  let weekends = fullWeeks * 2;
  if (remainder > 0) {
    const distToSat = (6 - startWeekday + 7) % 7 || 7;
    const distToSun = (0 - startWeekday + 7) % 7 || 7;
    if (distToSat <= remainder) weekends++;
    if (distToSun <= remainder) weekends++;
  }

  return weekends;
};

/** Counts Bangkok working days after `from` through `to` (inclusive) in O(1) time complexity. */
export const countBangkokWorkingDays = (
  from: Date,
  to: Date,
  holidayDates: Set<string> | BangkokWorkingDayHolidayIndex
): number => {
  const start = bangkokDayStartUtc(from);
  const end = bangkokDayStartUtc(to);
  if (start >= end) {
    return 0;
  }

  const calendarDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS);
  const startWeekday = bangkokWeekday(start);
  const weekends = countBangkokWeekendDays(startWeekday, calendarDays);

  const index = createBangkokWorkingDayHolidayIndex(holidayDates);
  const weekdayHolidays = index.weekdayHolidayDates.length;

  return Math.max(0, calendarDays - weekends - weekdayHolidays);
};

export const addBangkokWorkingDays = (
  startDate: Date,
  workingDays: number,
  holidayDates: Set<string> | BangkokWorkingDayHolidayIndex
): Date => {
  const index = createBangkokWorkingDayHolidayIndex(holidayDates);
  const holidaySet = new Set(index.weekdayHolidayDates);

  let cursor = bangkokDayStartUtc(startDate);
  let remaining = workingDays;

  while (remaining > 0) {
    cursor = addBangkokDays(cursor, 1);
    const iso = formatBangkokDate(cursor);
    if (!isBangkokWeekend(cursor) && !holidaySet.has(iso)) {
      remaining--;
    }
  }

  return cursor;
};

export const countWorkingDays = countBangkokWorkingDays;

