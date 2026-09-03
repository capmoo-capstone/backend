import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  syncDeadlineNotificationsForAllUsers,
  sendContractCommitteeReminders,
  sendDailySummaryEmailsToOptedInUsers,
} = vi.hoisted(() => ({
  syncDeadlineNotificationsForAllUsers: vi.fn(),
  sendContractCommitteeReminders: vi.fn(),
  sendDailySummaryEmailsToOptedInUsers: vi.fn(),
}));

const { runtimeConfig } = vi.hoisted(() => ({
  runtimeConfig: {
    cronEmailAllowlist: new Set<string>(['allowed@example.com']),
  },
}));

vi.mock('../../config/runtime', () => ({ runtimeConfig }));
vi.mock('../notification/notification-query.service', () => ({
  syncDeadlineNotificationsForAllUsers,
}));
vi.mock('../notification/contract-committee-reminder.service', () => ({
  sendContractCommitteeReminders,
}));
vi.mock('../notification/notification-email.service', () => ({
  sendDailySummaryEmailsToOptedInUsers,
}));

import { runDirectCronTask } from './direct-cron.service';

describe('direct cron execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.cronEmailAllowlist = new Set(['allowed@example.com']);
    syncDeadlineNotificationsForAllUsers.mockResolvedValue(undefined);
    sendContractCommitteeReminders.mockResolvedValue({});
    sendDailySummaryEmailsToOptedInUsers.mockResolvedValue({});
  });

  it('executes deadline work without Redis or BullMQ', async () => {
    await expect(runDirectCronTask('process-deadlines')).resolves.toEqual({
      message: 'process-deadlines completed',
      skipped: false,
    });

    expect(syncDeadlineNotificationsForAllUsers).toHaveBeenCalledOnce();
  });

  it('passes the normalized allow-list to committee reminders', async () => {
    await runDirectCronTask('contract-committee-reminders');

    expect(sendContractCommitteeReminders).toHaveBeenCalledWith({
      allowedEmails: new Set(['allowed@example.com']),
    });
  });

  it('skips email jobs when the allow-list is empty', async () => {
    runtimeConfig.cronEmailAllowlist = new Set();

    await expect(runDirectCronTask('daily-summary-email')).resolves.toEqual({
      message:
        'daily-summary-email skipped because CRON_EMAIL_ALLOWLIST is empty',
      skipped: true,
    });
    expect(sendDailySummaryEmailsToOptedInUsers).not.toHaveBeenCalled();
  });

  it('converts direct execution failures to retryable errors', async () => {
    sendContractCommitteeReminders.mockRejectedValue(
      new Error('provider down')
    );

    await expect(
      runDirectCronTask('contract-committee-reminders')
    ).rejects.toMatchObject({
      message: 'Cron execution failed',
      statusCode: 503,
    });
  });
});
