import { describe, expect, it } from 'vitest';
import { serializeBangkokDates } from '../date-response';

describe('serializeBangkokDates', () => {
  it('serializes nested Date values as Bangkok offset strings', () => {
    const result = serializeBangkokDates(
      {
        created_at: new Date('2026-07-12T02:00:00.000Z'),
        nested: {
          approved_at: new Date('2026-07-12T03:30:00.000Z'),
        },
        rows: [{ submitted_at: new Date('2026-07-12T04:00:00.000Z') }],
        empty: null,
      },
      new Set()
    );

    expect(result).toEqual({
      created_at: '2026-07-12T09:00:00.000+07:00',
      nested: {
        approved_at: '2026-07-12T10:30:00.000+07:00',
      },
      rows: [{ submitted_at: '2026-07-12T11:00:00.000+07:00' }],
      empty: null,
    });
  });

  it('serializes configured date-only keys as YYYY-MM-DD', () => {
    const result = serializeBangkokDates(
      {
        id: 'h-1',
        date: new Date('2026-07-12T00:00:00.000Z'),
        created_at: new Date('2026-07-12T02:00:00.000Z'),
      },
      new Set(['date'])
    );

    expect(result).toEqual({
      id: 'h-1',
      date: '2026-07-12',
      created_at: '2026-07-12T09:00:00.000+07:00',
    });
  });

  it('leaves non-plain objects untouched', () => {
    class DecimalLike {
      constructor(readonly value: string) {}
    }
    const amount = new DecimalLike('10.50');

    const result = serializeBangkokDates({ amount }, new Set());

    expect((result as { amount: DecimalLike }).amount).toBe(amount);
  });
});
