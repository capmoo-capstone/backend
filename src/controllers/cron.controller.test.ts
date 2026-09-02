import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runWithCronLock, triggerDeadlineReminderScan, triggerScheduledCronTask } = vi.hoisted(() => ({
  runWithCronLock: vi.fn(),
  triggerDeadlineReminderScan: vi.fn(),
  triggerScheduledCronTask: vi.fn(),
}));

vi.mock('../services/cron/cron-lock.service', () => ({ runWithCronLock }));
vi.mock('../services/cron/cron-task.service', () => ({
  triggerDeadlineReminderScan,
  triggerScheduledCronTask,
}));

import {
  processDeadlineNotifications,
  sendContractCommitteeReminderEmail,
  sendDailySummaryEmail,
} from './cron.controller';

const response = () => {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }) };
};

beforeEach(() => {
  vi.clearAllMocks();
  runWithCronLock.mockImplementation(async (_job, task) => ({
    acquired: true,
    value: await task(),
  }));
  triggerDeadlineReminderScan.mockResolvedValue({
    message: 'Deadline notification sync enqueued',
  });
  triggerScheduledCronTask.mockImplementation(async ({ kind }) => ({
    message: `${kind} job enqueued`,
    queued: true,
    skipped: false,
  }));
});

describe('cron controller', () => {
  it('enqueues deadline work instead of executing it inline', async () => {
    const res = response();
    await processDeadlineNotifications({} as any, res as any);

    expect(runWithCronLock).toHaveBeenCalledWith(
      'process-deadlines',
      triggerDeadlineReminderScan
    );
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Deadline notification sync enqueued',
      queued: true,
      skipped: false,
    });
  });

  it('reports an active lock as a successful skip', async () => {
    runWithCronLock.mockResolvedValue({ acquired: false });
    const res = response();

    await sendDailySummaryEmail({} as any, res as any);

    expect(triggerScheduledCronTask).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      message: 'daily-summary-email is already being queued',
      skipped: true,
    });
  });

  it('enqueues the daily summary work', async () => {
    const res = response();
    await sendDailySummaryEmail({} as any, res as any);

    expect(triggerScheduledCronTask).toHaveBeenCalledWith({
      kind: 'daily-summary-email',
    });
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      message: 'daily-summary-email job enqueued',
      queued: true,
      skipped: false,
    });
  });

  it('enqueues the committee reminder work', async () => {
    const res = response();
    await sendContractCommitteeReminderEmail({} as any, res as any);

    expect(triggerScheduledCronTask).toHaveBeenCalledWith({
      kind: 'contract-committee-reminders',
    });
  });
});
