import { runtimeConfig } from '../../config/runtime';
import {
  getQueueConnection,
  loadBullMq,
  QueueInstance,
} from '../queue/bullmq-runtime.service';

export type NotificationDeadlineJob =
  | { kind: 'scan' }
  | { kind: 'outbox-flush' }
  | { kind: 'cleanup' }
  | {
      kind: 'dispatch';
      reminderId: string;
      userId: string;
      projectId: string;
      targetKey: string;
      targetDateIso: string;
      windowKey: string;
      scheduledForIso: string;
      title: string;
      body: string;
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      dedupeKey: string;
      targetPath: string;
      metadata: Record<string, unknown>;
    };

export const DEADLINE_NOTIFICATION_QUEUE_NAME =
  'notifications-deadline-reminders';

let deadlineQueue: QueueInstance<NotificationDeadlineJob> | null = null;

export const getDeadlineQueue = () => {
  const connection = getQueueConnection();
  if (!connection) return null;

  const { Queue } = loadBullMq();
  deadlineQueue ??= new Queue(DEADLINE_NOTIFICATION_QUEUE_NAME, {
    connection,
    prefix: runtimeConfig.redisPrefix,
  });

  return deadlineQueue;
};

export const enqueueDeadlineScan = async () => {
  const queue = getDeadlineQueue();
  if (!queue) return null;

  return queue.add(
    'scan',
    { kind: 'scan' },
    {
      jobId: 'deadline-scan-once',
      removeOnComplete: 1000,
    }
  );
};

export const enqueueNotificationOutboxFlush = async () => {
  const queue = getDeadlineQueue();
  if (!queue) return null;

  return queue.add(
    'outbox-flush',
    { kind: 'outbox-flush' },
    {
      jobId: 'notification-outbox-flush',
      removeOnComplete: 1000,
    }
  );
};

export const enqueueNotificationCleanup = async () => {
  const queue = getDeadlineQueue();
  if (!queue) return null;

  return queue.add(
    'cleanup',
    { kind: 'cleanup' },
    {
      jobId: 'notification-cleanup-once',
      removeOnComplete: 1000,
    }
  );
};

export const enqueueDeadlineDispatch = async (
  job: Extract<NotificationDeadlineJob, { kind: 'dispatch' }>
) => {
  const queue = getDeadlineQueue();
  if (!queue) return null;

  return queue.add('dispatch', job, {
    jobId: `deadline-dispatch:${job.reminderId}`,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000,
    },
    removeOnComplete: 1000,
  });
};

export const startNotificationDeadlineWorker = (
  processor: (job: NotificationDeadlineJob) => Promise<void>
) => {
  const connection = getQueueConnection();
  if (!connection) return null;

  const { Worker } = loadBullMq();

  return new Worker<NotificationDeadlineJob>(
    DEADLINE_NOTIFICATION_QUEUE_NAME,
    async (job) => {
      await processor(job.data);
    },
    {
      connection,
      prefix: runtimeConfig.redisPrefix,
    }
  );
};

export const registerNotificationQueueSchedules = async () => {
  const queue = getDeadlineQueue();
  if (!queue) return [];

  await queue.add('scan', { kind: 'scan' }, {
    jobId: 'deadline-scan-repeat',
    repeat: { every: runtimeConfig.deadlineWorkerRepeatMs },
    removeOnComplete: 1000,
  } as Record<string, unknown>);
  await queue.add('outbox-flush', { kind: 'outbox-flush' }, {
    jobId: 'notification-outbox-flush-repeat',
    repeat: { every: runtimeConfig.outboxWorkerRepeatMs },
    removeOnComplete: 1000,
  } as Record<string, unknown>);
  await queue.add('cleanup', { kind: 'cleanup' }, {
    jobId: 'notification-cleanup-repeat',
    repeat: { every: runtimeConfig.notificationCleanupRepeatMs },
    removeOnComplete: 1000,
  } as Record<string, unknown>);

  return ['scan', 'outbox-flush', 'cleanup'];
};
