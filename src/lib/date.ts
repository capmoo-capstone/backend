import { z } from 'zod';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const OFFSET_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

export type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateParts & {
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

const pad = (value: number, length = 2): string =>
  value.toString().padStart(length, '0');

const assertValidUtcParts = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
}: DateTimeParts): void => {
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  );
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    throw new Error('Invalid date');
  }
};

const fromBangkokParts = (parts: DateTimeParts): Date => {
  const {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  } = parts;
  assertValidUtcParts({ year, month, day, hour, minute, second, millisecond });
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
      BANGKOK_OFFSET_MS
  );
};

const parseMillisecond = (value?: string): number => {
  if (!value) return 0;
  return Number(value.padEnd(3, '0'));
};

export const nowUtc = (): Date => new Date();

export const parseBangkokDateTime = (value: unknown): Date => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid date');
    return new Date(value.getTime());
  }

  if (typeof value !== 'string') {
    throw new Error('Expected ISO date string');
  }

  const input = value.trim();
  if (!input || input.includes('/')) {
    throw new Error('Use ISO date format, for example 2026-07-12T09:00:00');
  }

  const dateOnly = DATE_ONLY_RE.exec(input);
  if (dateOnly) {
    return fromBangkokParts({
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
    });
  }

  const localDateTime = LOCAL_DATE_TIME_RE.exec(input);
  if (localDateTime) {
    return fromBangkokParts({
      year: Number(localDateTime[1]),
      month: Number(localDateTime[2]),
      day: Number(localDateTime[3]),
      hour: Number(localDateTime[4]),
      minute: Number(localDateTime[5]),
      second: Number(localDateTime[6] ?? 0),
      millisecond: parseMillisecond(localDateTime[7]),
    });
  }

  if (OFFSET_DATE_TIME_RE.test(input)) {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    return date;
  }

  throw new Error('Use ISO date format, for example 2026-07-12T09:00:00');
};

export const BangkokDateTimeSchema = z
  .union([z.string(), z.date()])
  .transform((value, ctx) => {
    try {
      return parseBangkokDateTime(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid date',
      });
      return z.NEVER;
    }
  });

export const toBangkokParts = (date: Date): DateParts => {
  const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: bangkokDate.getUTCFullYear(),
    month: bangkokDate.getUTCMonth() + 1,
    day: bangkokDate.getUTCDate(),
  };
};

export const toBangkokDateTimeParts = (date: Date): Required<DateTimeParts> => {
  const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: bangkokDate.getUTCFullYear(),
    month: bangkokDate.getUTCMonth() + 1,
    day: bangkokDate.getUTCDate(),
    hour: bangkokDate.getUTCHours(),
    minute: bangkokDate.getUTCMinutes(),
    second: bangkokDate.getUTCSeconds(),
    millisecond: bangkokDate.getUTCMilliseconds(),
  };
};

export const fromBangkokDate = (
  year: number,
  month: number,
  day: number,
  endOfDay = false
): Date =>
  fromBangkokParts(
    endOfDay
      ? { year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }
      : { year, month, day }
  );

export const bangkokDayStartUtc = (value: Date | string): Date => {
  const parts = toBangkokParts(parseBangkokDateTime(value));
  return fromBangkokDate(parts.year, parts.month, parts.day);
};

export const bangkokDayEndUtc = (value: Date | string): Date => {
  const parts = toBangkokParts(parseBangkokDateTime(value));
  return fromBangkokDate(parts.year, parts.month, parts.day, true);
};

export const bangkokTodayStartUtc = (now = nowUtc()): Date => {
  const parts = toBangkokParts(now);
  return fromBangkokDate(parts.year, parts.month, parts.day);
};

export const addBangkokDays = (
  date: Date,
  days: number,
  endOfDay = false
): Date => {
  const parts = toBangkokParts(date);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return fromBangkokDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    endOfDay
  );
};

export const addBangkokMonths = (
  date: Date,
  monthsToAdd: number,
  endOfDay = false
): Date => {
  const parts = toBangkokParts(date);
  const zeroBasedMonth = parts.month - 1 + monthsToAdd;
  const targetYear = parts.year + Math.floor(zeroBasedMonth / 12);
  const targetMonth = ((zeroBasedMonth % 12) + 12) % 12;
  const month = targetMonth + 1;
  const day = Math.min(parts.day, daysInBangkokMonth(targetYear, month));
  return fromBangkokDate(targetYear, month, day, endOfDay);
};

export const daysInBangkokMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const bangkokWeekday = (date: Date): number => {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return shifted.getUTCDay();
};

export const formatBangkokDate = (date: Date): string => {
  const parts = toBangkokParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

export const formatBangkokOffset = (date: Date): string => {
  const parts = toBangkokDateTimeParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour
  )}:${pad(parts.minute)}:${pad(parts.second)}.${pad(
    parts.millisecond,
    3
  )}+07:00`;
};
