import { describe, expect, it } from 'vitest';
import {
  activeDelegationWhere,
  getNextDelegationBoundary,
  openDelegationWhere,
} from '../active-state';

describe('active state predicates', () => {
  it('uses one reference time for active delegation predicates', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    expect(activeDelegationWhere(now)).toMatchObject({
      is_active: true,
      cancelled_at: null,
      start_date: { lte: now },
    });
    expect(openDelegationWhere(now)).toMatchObject({
      is_active: true,
      cancelled_at: null,
    });
  });

  it('finds the next role-cache invalidation boundary', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    expect(
      getNextDelegationBoundary(
        [
          {
            start_date: new Date('2026-06-03T00:00:00.000Z'),
            end_date: null,
          },
          {
            start_date: new Date('2026-05-01T00:00:00.000Z'),
            end_date: new Date('2026-06-02T00:00:00.000Z'),
          },
        ],
        now
      )
    ).toEqual(new Date('2026-06-02T00:00:00.000Z'));
  });
});
