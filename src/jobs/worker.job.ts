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

const observeWorker = <T>(queueName: string, worker: WorkerInstance<T>) => {
  worker.on('ready', () => console.info('BullMQ worker connected', { queueName }));

  worker.on('failed', (job, error) => {
    const failedJob = job as WorkerJob<T> | undefined;
    console.error('BullMQ job failed', {
      queueName,
      jobId: failedJob?.id ?? null,
      jobName: failedJob?.name ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  worker.on('error', (error) => {
    console.error('BullMQ worker error', {
      queueName,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

const run = async () => {
  assertRedisConfigured('worker');

  const notificationWorker =
    startNotificationDeadlineWorker(processDeadlineQueueJob);
  const scheduledCronWorker = startScheduledCronTaskWorker(async (job) => {
    await runScheduledCronTask(job);
  });

  if (!notificationWorker || !scheduledCronWorker) {
    throw new Error('Worker failed to start queue consumers');
  }

  observeWorker(
    DEADLINE_NOTIFICATION_QUEUE_NAME,
    notificationWorker as WorkerInstance<unknown>
  );
  observeWorker(
    SCHEDULED_CRON_QUEUE_NAME,
    scheduledCronWorker as WorkerInstance<unknown>
  );
};

run().catch((error) => {
  console.error('BullMQ worker startup failed', error);
  process.exitCode = 1;
});
