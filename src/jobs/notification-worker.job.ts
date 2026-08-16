import { runtimeConfig } from '../config/runtime';
import {
  enqueueDeadlineScan,
  enqueueNotificationOutboxFlush,
  getDeadlineQueue,
  startNotificationDeadlineWorker,
} from '../services/notification/notification-queue.service';
import { processDeadlineQueueJob } from '../services/notification/notification-query.service';

const run = async () => {
  const worker = startNotificationDeadlineWorker(processDeadlineQueueJob);
  const queue = getDeadlineQueue();

  if (!worker || !queue) {
    console.warn('Notification worker skipped because REDIS_URL is not configured');
    return;
  }

  await queue.add(
    'scan',
    { kind: 'scan' },
    {
      jobId: 'deadline-scan-repeat',
      repeat: { every: runtimeConfig.deadlineWorkerRepeatMs },
      removeOnComplete: 1000,
    } as Record<string, unknown>
  );

  await queue.add(
    'outbox-flush',
    { kind: 'outbox-flush' },
    {
      jobId: 'notification-outbox-flush-repeat',
      repeat: { every: runtimeConfig.outboxWorkerRepeatMs },
      removeOnComplete: 1000,
    } as Record<string, unknown>
  );

  await enqueueDeadlineScan();
  await enqueueNotificationOutboxFlush();

  worker.on('failed', (job, error) => {
    const failedJob = job as { id?: string; name?: string } | undefined;
    console.error(
      'Notification worker job failed',
      {
        id: failedJob?.id,
        name: failedJob?.name,
      },
      error
    );
  });

  worker.on('error', (error) => {
    console.error('Notification worker error', error);
  });

  console.log('Notification worker started');
};

run().catch((error) => {
  console.error('Notification worker failed to start', error);
  process.exitCode = 1;
});
