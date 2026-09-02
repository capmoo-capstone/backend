import * as NotificationService from '../notification/notification.service';
import { sendContractCommitteeReminders } from '../notification/contract-committee-reminder.service';
import { sendDailySummaryEmailsToOpsUsers } from '../notification/notification-email.service';
import { enqueueScheduledCronTask, ScheduledCronTaskJob } from './cron-queue.service';
import { runInCronScheduleWindow } from './cron-lock.service';

export const triggerDeadlineReminderScan = async () => {
  await NotificationService.enqueueDeadlineReminderScan();
  return { message: 'Deadline notification sync enqueued' };
};

export const triggerScheduledCronTask = async (job: ScheduledCronTaskJob) => {
  const window = new Date().toISOString().slice(0, 10);
  const result = await runInCronScheduleWindow(job.kind, window, () =>
    enqueueScheduledCronTask(job)
  );

  return {
    message: result.accepted
      ? `${job.kind} job enqueued`
      : `${job.kind} already queued for this schedule window`,
    queued: result.accepted,
    skipped: !result.accepted,
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
