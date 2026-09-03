import { runtimeConfig } from '../../config/runtime';
import { ServiceUnavailableError } from '../../utils/errors';
import { syncDeadlineNotificationsForAllUsers } from '../notification/notification-query.service';
import { sendContractCommitteeReminders } from '../notification/contract-committee-reminder.service';
import { sendDailySummaryEmailsToOptedInUsers } from '../notification/notification-email.service';

export type DirectCronJob =
  | 'process-deadlines'
  | 'contract-committee-reminders'
  | 'daily-summary-email';

export type DirectCronResult = {
  message: string;
  skipped: boolean;
};

const isEmailJob = (job: DirectCronJob) =>
  job === 'contract-committee-reminders' || job === 'daily-summary-email';

const runDirectWork = async (job: DirectCronJob) => {
  switch (job) {
    case 'process-deadlines':
      return syncDeadlineNotificationsForAllUsers();
    case 'contract-committee-reminders':
      return sendContractCommitteeReminders({
        allowedEmails: runtimeConfig.cronEmailAllowlist,
      });
    case 'daily-summary-email':
      return sendDailySummaryEmailsToOptedInUsers(
        new Date(),
        runtimeConfig.cronEmailAllowlist
      );
  }
};

export const runDirectCronTask = async (
  job: DirectCronJob
): Promise<DirectCronResult> => {
  if (isEmailJob(job) && runtimeConfig.cronEmailAllowlist.size === 0) {
    console.warn('Direct cron email delivery skipped: allow-list is empty', {
      job,
    });
    return {
      message: `${job} skipped because CRON_EMAIL_ALLOWLIST is empty`,
      skipped: true,
    };
  }

  try {
    await runDirectWork(job);
    return { message: `${job} completed`, skipped: false };
  } catch (error) {
    console.error('Direct cron execution failed', {
      job,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ServiceUnavailableError('Cron execution failed');
  }
};
