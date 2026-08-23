import { readFileSync } from 'node:fs';
import { runtimeConfig } from '../../config/runtime';
import { isRedisConfigured } from '../../config/runtime';

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
  'notifications:deadline-reminders';

type QueueInstance<T> = {
  add(
    name: string,
    data: T,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  close(): Promise<void>;
};

type WorkerInstance = {
  on(event: string, listener: (...args: unknown[]) => void): WorkerInstance;
  close(): Promise<void>;
};

const loadBullMq = () => {
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire('bullmq') as {
    Queue: new (
      name: string,
      options?: Record<string, unknown>
    ) => QueueInstance<NotificationDeadlineJob>;
    Worker: new (
      name: string,
      processor: (job: {
        name: string;
        data: NotificationDeadlineJob;
      }) => Promise<unknown>,
      options?: Record<string, unknown>
    ) => WorkerInstance;
  };
};

const getRedisTlsOptions = () => {
  if (!runtimeConfig.redisUrl.startsWith('rediss://')) return undefined;

  return {
    ca: runtimeConfig.redisTlsCaPath
      ? readFileSync(runtimeConfig.redisTlsCaPath, 'utf8')
      : undefined,
    servername: runtimeConfig.redisTlsServername || undefined,
    rejectUnauthorized: runtimeConfig.redisTlsRejectUnauthorized,
  };
};

const getQueueConnection = () => {
  if (!runtimeConfig.redisUrl) return null;
  return {
    url: runtimeConfig.redisUrl,
    tls: getRedisTlsOptions(),
    maxRetriesPerRequest: null,
  };
};

let deadlineQueue: QueueInstance<NotificationDeadlineJob> | null = null;

export const getDeadlineQueue = () => {
  const connection = getQueueConnection();
  if (!connection || !isRedisConfigured()) return null;

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
  if (!connection || !isRedisConfigured()) return null;

  const { Worker } = loadBullMq();

  return new Worker(
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
