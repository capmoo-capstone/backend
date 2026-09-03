import { runtimeConfig } from '../../config/runtime';
import {
  getQueueConnection,
  loadBullMq,
  QueueInstance,
  WorkerInstance,
} from '../queue/bullmq-runtime.service';
import { ServiceUnavailableError } from '../../utils/errors';

export type ScheduledCronTaskJob =
  | { kind: 'daily-summary-email' }
  | { kind: 'contract-committee-reminders' };

export const SCHEDULED_CRON_QUEUE_NAME = 'system:scheduled-cron';

let cronQueue: QueueInstance<ScheduledCronTaskJob> | null = null;

export const getScheduleWindow = (now = new Date()) =>
  now.toISOString().slice(0, 10);

export const scheduledCronJobId = (
  job: ScheduledCronTaskJob,
  window = getScheduleWindow()
) => `scheduled-${job.kind}-${window}`;

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

export const enqueueScheduledCronTask = async (
  job: ScheduledCronTaskJob,
  window = getScheduleWindow()
) => {
  const queue = getScheduledCronQueue();
  if (!queue) {
    throw new ServiceUnavailableError('Cron queue is unavailable');
  }

  return queue.add(job.kind, job, {
    jobId: scheduledCronJobId(job, window),
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
};

export const startScheduledCronTaskWorker = (
  processor: (job: ScheduledCronTaskJob) => Promise<void>
) => {
  const connection = getQueueConnection();
  if (!connection) return null;

  const { Worker } = loadBullMq();
  return new Worker<ScheduledCronTaskJob>(
    SCHEDULED_CRON_QUEUE_NAME,
    async (job) => processor(job.data),
    { connection, prefix: runtimeConfig.redisPrefix }
  );
};
