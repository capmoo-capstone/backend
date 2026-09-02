import '../config/env';
import { processDeadlineQueueJob } from '../services/notification/notification-query.service';
import {
  DEADLINE_NOTIFICATION_QUEUE_NAME,
  startNotificationDeadlineWorker,
} from '../services/notification/notification-queue.service';
import {
  SCHEDULED_CRON_QUEUE_NAME,
  startScheduledCronTaskWorker,
} from '../services/cron/cron-queue.service';
import { runScheduledCronTask } from '../services/cron/cron-task.service';
import {
  assertRedisConfigured,
  WorkerInstance,
  WorkerJob,
} from '../services/queue/bullmq-runtime.service';
import { logRuntimeError, logRuntimeEvent } from '../utils/runtime-log';

const attachWorkerObservers = <T>(
  queueName: string,
  worker: WorkerInstance<T>
) => {
  worker.on('ready', () => {
    logRuntimeEvent('worker', 'connected-to-redis', { queueName });
  });

  worker.on('active', (job) => {
    const activeJob = job as WorkerJob<T> | undefined;
    logRuntimeEvent('worker', 'job-started', {
      queueName,
      jobId: activeJob?.id ?? null,
      jobName: activeJob?.name ?? null,
    });
  });

  worker.on('completed', (job) => {
    const completedJob = job as WorkerJob<T> | undefined;
    logRuntimeEvent('worker', 'job-completed', {
      queueName,
      jobId: completedJob?.id ?? null,
      jobName: completedJob?.name ?? null,
    });
  });

  worker.on('failed', (job, error) => {
    const failedJob = job as WorkerJob<T> | undefined;
    logRuntimeError('worker', 'job-failed', error, {
      queueName,
      jobId: failedJob?.id ?? null,
      jobName: failedJob?.name ?? null,
    });
  });

  worker.on('error', (error) => {
    logRuntimeError('worker', 'worker-error', error, { queueName });
  });
};

const run = async () => {
  assertRedisConfigured('worker');

  logRuntimeEvent('worker', 'startup', {
    queues: [DEADLINE_NOTIFICATION_QUEUE_NAME, SCHEDULED_CRON_QUEUE_NAME],
  });

  const notificationWorker =
    startNotificationDeadlineWorker(processDeadlineQueueJob);
  const scheduledCronWorker = startScheduledCronTaskWorker(async (job) => {
    await runScheduledCronTask(job);
  });

  if (!notificationWorker || !scheduledCronWorker) {
    throw new Error('Worker failed to start queue consumers');
  }

  attachWorkerObservers(
    DEADLINE_NOTIFICATION_QUEUE_NAME,
    notificationWorker as WorkerInstance<unknown>
  );
  attachWorkerObservers(
    SCHEDULED_CRON_QUEUE_NAME,
    scheduledCronWorker as WorkerInstance<unknown>
  );

  logRuntimeEvent('worker', 'startup-complete', {
    queues: [DEADLINE_NOTIFICATION_QUEUE_NAME, SCHEDULED_CRON_QUEUE_NAME],
  });
};

run().catch((error) => {
  logRuntimeError('worker', 'startup-failed', error);
  process.exitCode = 1;
});
