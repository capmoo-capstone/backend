import '../config/env';
import {
  enqueueDeadlineScan,
  enqueueNotificationCleanup,
  enqueueNotificationOutboxFlush,
  registerNotificationQueueSchedules,
} from '../services/notification/notification-queue.service';
import { assertRedisConfigured } from '../services/queue/bullmq-runtime.service';

const run = async () => {
  assertRedisConfigured('scheduler');
  await registerNotificationQueueSchedules();
  await enqueueDeadlineScan();
  await enqueueNotificationOutboxFlush();
  await enqueueNotificationCleanup();
};

run().catch((error) => {
  console.error('Notification scheduler startup failed', error);
  process.exitCode = 1;
});
