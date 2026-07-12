import { describe, expect, it } from 'vitest';
import {
  bangkokDayEndUtc,
  bangkokDayStartUtc,
  BangkokDateTimeSchema,
  formatBangkokOffset,
  parseBangkokDateTime,
  toBangkokParts,
} from '../date';

describe('Bangkok date utilities', () => {
  it('stores timezone-less ISO datetime input as the equivalent UTC instant', () => {
    const date = parseBangkokDateTime('2026-07-12T09:00:00');

    expect(date.toISOString()).toBe('2026-07-12T02:00:00.000Z');
  });

  it('formats stored UTC instants back to Bangkok offset time', () => {
    const date = new Date('2026-07-12T02:00:00.000Z');

    expect(formatBangkokOffset(date)).toBe('2026-07-12T09:00:00.000+07:00');
  });

  it('keeps explicit offset input as the represented instant', () => {
    const date = parseBangkokDateTime('2026-07-12T09:00:00+07:00');

    expect(date.toISOString()).toBe('2026-07-12T02:00:00.000Z');
  });

  it('treats date-only input as Bangkok start of day', () => {
    const date = parseBangkokDateTime('2026-07-12');

    expect(date.toISOString()).toBe('2026-07-11T17:00:00.000Z');
  });

  it('builds Bangkok day boundaries in UTC', () => {
    expect(bangkokDayStartUtc('2026-07-12').toISOString()).toBe(
      '2026-07-11T17:00:00.000Z'
    );
    expect(bangkokDayEndUtc('2026-07-12').toISOString()).toBe(
      '2026-07-12T16:59:59.999Z'
    );
  });

  it('rejects ambiguous slash dates', () => {
    expect(() => parseBangkokDateTime('12/7/2026 9.00AM')).toThrow(
      'Use ISO date format'
    );
    expect(() => BangkokDateTimeSchema.parse('12/7/2026 9.00AM')).toThrow();
  });

  it('returns Bangkok calendar parts for a UTC instant', () => {
    expect(toBangkokParts(new Date('2026-07-11T17:30:00.000Z'))).toEqual({
      year: 2026,
      month: 7,
      day: 12,
    });
  });
});
