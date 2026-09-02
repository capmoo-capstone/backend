import { runtimeConfig } from '../../config/runtime';
import {
  getQueueConnection,
  loadBullMq,
  QueueInstance,
  WorkerInstance,
} from '../queue/bullmq-runtime.service';

export type ScheduledCronTaskJob =
  | { kind: 'daily-summary-email' }
  | { kind: 'contract-committee-reminders' };

export const SCHEDULED_CRON_QUEUE_NAME = 'system:scheduled-cron';

type ScheduledJobDefinition = {
  queueName: string;
  jobName: string;
  schedule: string;
};

let cronQueue: QueueInstance<ScheduledCronTaskJob> | null = null;

export const getScheduledCronQueue = () => {
  const connection = getQueueConnection();
  if (!connection) return null;

  const { Queue } = loadBullMq();
  cronQueue ??= new Queue(SCHEDULED_CRON_QUEUE_NAME, {
    connection,
    prefix: runtimeConfig.redisPrefix,
  });

  return cronQueue;
};

export const enqueueScheduledCronTask = async (job: ScheduledCronTaskJob) => {
  const queue = getScheduledCronQueue();
  if (!queue) return null;

  return queue.add(job.kind, job, {
    jobId: `scheduled-${job.kind}-${new Date().toISOString().slice(0, 10)}`,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
};

export const registerScheduledCronTasks = async () => {
  const queue = getScheduledCronQueue();
  if (!queue) return [];

  await queue.add(
    'contract-committee-reminders',
    { kind: 'contract-committee-reminders' },
    {
      jobId: 'contract-committee-reminders-repeat',
      repeat: {
        pattern: runtimeConfig.contractCommitteeReminderCron,
        tz: runtimeConfig.schedulerTimezone,
      },
      removeOnComplete: 1000,
    } as Record<string, unknown>
  );

  await queue.add(
    'daily-summary-email',
    { kind: 'daily-summary-email' },
    {
      jobId: 'daily-summary-email-repeat',
      repeat: {
        pattern: runtimeConfig.dailySummaryEmailCron,
        tz: runtimeConfig.schedulerTimezone,
      },
      removeOnComplete: 1000,
    } as Record<string, unknown>
  );

  return [
    {
      queueName: SCHEDULED_CRON_QUEUE_NAME,
      jobName: 'contract-committee-reminders',
      schedule: `${runtimeConfig.contractCommitteeReminderCron} (${runtimeConfig.schedulerTimezone})`,
    },
    {
      queueName: SCHEDULED_CRON_QUEUE_NAME,
      jobName: 'daily-summary-email',
      schedule: `${runtimeConfig.dailySummaryEmailCron} (${runtimeConfig.schedulerTimezone})`,
    },
  ] satisfies ScheduledJobDefinition[];
};

export const startScheduledCronTaskWorker = (
  processor: (job: ScheduledCronTaskJob) => Promise<void>
) => {
  const connection = getQueueConnection();
  if (!connection) return null;

  const { Worker } = loadBullMq();

  return new Worker(
    SCHEDULED_CRON_QUEUE_NAME,
    async (job) => {
      await processor(job.data);
    },
    {
      connection,
      prefix: runtimeConfig.redisPrefix,
    }
  ) as WorkerInstance<ScheduledCronTaskJob>;
};
