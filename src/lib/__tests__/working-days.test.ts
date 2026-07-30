import { describe, expect, it } from 'vitest';
import {
  addBangkokWorkingDays,
  countBangkokWorkingDays,
  createBangkokWorkingDayHolidayIndex,
} from '../working-days';

describe('countBangkokWorkingDays', () => {
  it('excludes the start date, weekends, and Bangkok holiday dates', () => {
    expect(
      countBangkokWorkingDays(
        new Date('2026-06-30T17:00:00.000Z'),
        new Date('2026-07-05T17:00:00.000Z'),
        new Set(['2026-07-03'])
      )
    ).toBe(2);
  });

  it('returns zero for a same-day, weekend, or holiday completion', () => {
    expect(
      countBangkokWorkingDays(
        new Date('2026-07-01T17:00:00.000Z'),
        new Date('2026-07-01T17:00:00.000Z'),
        new Set()
      )
    ).toBe(0);
    expect(
      countBangkokWorkingDays(
        new Date('2026-07-02T17:00:00.000Z'),
        new Date('2026-07-03T17:00:00.000Z'),
        new Set()
      )
    ).toBe(0);
    expect(
      countBangkokWorkingDays(
        new Date('2026-07-01T17:00:00.000Z'),
        new Date('2026-07-02T17:00:00.000Z'),
        new Set(['2026-07-03'])
      )
    ).toBe(0);
  });

  it('uses one sorted weekday-holiday index for long date ranges', () => {
    const holidayIndex = createBangkokWorkingDayHolidayIndex(
      new Set(['2026-07-03', '2026-07-04', '2027-01-01'])
    );

    expect(holidayIndex.weekdayHolidayDates).toEqual([
      '2026-07-03',
      '2027-01-01',
    ]);
    expect(
      countBangkokWorkingDays(
        new Date('2025-12-31T17:00:00.000Z'),
        new Date('2026-12-31T17:00:00.000Z'),
        holidayIndex
      )
    ).toBe(259);
  });

  it('finds an added working-day deadline without advancing one day at a time', () => {
    expect(
      addBangkokWorkingDays(
        new Date('2026-07-01T17:00:00.000Z'),
        1,
        new Set(['2026-07-03'])
      ).toISOString()
    ).toBe('2026-07-05T17:00:00.000Z');
  });
});
