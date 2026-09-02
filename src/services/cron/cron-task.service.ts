import { ServiceUnavailableError } from '../../utils/errors';
import { enqueueDeadlineScan } from '../notification/notification-queue.service';
import { sendContractCommitteeReminders } from '../notification/contract-committee-reminder.service';
import { sendDailySummaryEmailsToOpsUsers } from '../notification/notification-email.service';
import {
  enqueueScheduledCronTask,
  getScheduleWindow,
  ScheduledCronTaskJob,
} from './cron-queue.service';
import { runInCronScheduleWindow } from './cron-lock.service';

export const triggerDeadlineReminderScan = async () => {
  const queued = await enqueueDeadlineScan();
  if (!queued) {
    throw new ServiceUnavailableError('Cron queue is unavailable');
  }

  return { message: 'Deadline notification sync enqueued' };
};

export const triggerScheduledCronTask = async (job: ScheduledCronTaskJob) => {
  const window = getScheduleWindow();
  const result = await runInCronScheduleWindow(job.kind, window, () =>
    enqueueScheduledCronTask(job, window)
  );

  return {
    message: result.acquired
      ? `${job.kind} job enqueued`
      : `${job.kind} already queued for this schedule window`,
    queued: result.acquired,
    skipped: !result.acquired,
  };
};

export const runScheduledCronTask = async (job: ScheduledCronTaskJob) => {
  switch (job.kind) {
    case 'daily-summary-email':
      return sendDailySummaryEmailsToOpsUsers();
    case 'contract-committee-reminders':
      return sendContractCommitteeReminders();
  }
};
