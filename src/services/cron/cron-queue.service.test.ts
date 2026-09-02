import { describe, expect, it } from 'vitest';
import {
  getScheduleWindow,
  scheduledCronJobId,
} from './cron-queue.service';

describe('scheduled cron queue', () => {
  it('uses one deterministic ID for a job kind in one UTC date window', () => {
    const window = getScheduleWindow(new Date('2026-09-03T03:00:00.000Z'));
    expect(scheduledCronJobId({ kind: 'daily-summary-email' }, window)).toBe(
      'scheduled-daily-summary-email-2026-09-03'
    );
  });
});
