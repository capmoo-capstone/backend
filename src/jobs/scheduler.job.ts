import '../config/env';
import {
  DEADLINE_NOTIFICATION_QUEUE_NAME,
  enqueueDeadlineScan,
  enqueueNotificationCleanup,
  enqueueNotificationOutboxFlush,
  registerNotificationQueueSchedules,
} from '../services/notification/notification-queue.service';
import { assertRedisConfigured } from '../services/queue/bullmq-runtime.service';
import { logRuntimeError, logRuntimeEvent } from '../utils/runtime-log';

const run = async () => {
  assertRedisConfigured('scheduler');

  logRuntimeEvent('scheduler', 'startup');

  const notificationSchedules = await registerNotificationQueueSchedules();
  for (const schedule of notificationSchedules) {
    logRuntimeEvent('scheduler', 'schedule-registered', schedule);
  }

  await enqueueDeadlineScan();
  logRuntimeEvent('scheduler', 'job-enqueued', {
    queueName: DEADLINE_NOTIFICATION_QUEUE_NAME,
    jobName: 'scan',
    reason: 'startup-prime',
  });

  await enqueueNotificationOutboxFlush();
  logRuntimeEvent('scheduler', 'job-enqueued', {
    queueName: DEADLINE_NOTIFICATION_QUEUE_NAME,
    jobName: 'outbox-flush',
    reason: 'startup-prime',
  });

  await enqueueNotificationCleanup();
  logRuntimeEvent('scheduler', 'job-enqueued', {
    queueName: DEADLINE_NOTIFICATION_QUEUE_NAME,
    jobName: 'cleanup',
    reason: 'startup-prime',
  });

  logRuntimeEvent('scheduler', 'startup-complete', {
    scheduleCount: notificationSchedules.length,
  });
};

run().catch((error) => {
  logRuntimeError('scheduler', 'startup-failed', error);
  process.exitCode = 1;
});
