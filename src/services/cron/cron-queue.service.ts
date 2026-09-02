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
