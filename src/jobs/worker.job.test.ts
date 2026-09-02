import { describe, expect, it, vi } from 'vitest';

const startNotificationDeadlineWorker = vi.fn();
const startScheduledCronTaskWorker = vi.fn();
const assertRedisConfigured = vi.fn();

vi.mock('../services/notification/notification-query.service', () => ({
  processDeadlineQueueJob: vi.fn(),
}));

vi.mock('../services/notification/notification-queue.service', () => ({
  DEADLINE_NOTIFICATION_QUEUE_NAME: 'notifications:deadline-reminders',
  startNotificationDeadlineWorker,
}));

vi.mock('../services/cron/cron-task.service', () => ({
  runScheduledCronTask: vi.fn(),
}));

vi.mock('../services/cron/cron-queue.service', () => ({
  SCHEDULED_CRON_QUEUE_NAME: 'system:scheduled-cron',
  startScheduledCronTaskWorker,
}));

vi.mock('../services/queue/bullmq-runtime.service', () => ({
  assertRedisConfigured,
}));

vi.mock('../utils/runtime-log', () => ({
  logRuntimeEvent: vi.fn(),
  logRuntimeError: vi.fn(),
}));

describe('worker.job', () => {
  it('starts both queue consumers and validates Redis configuration', async () => {
    const worker = {
      on: vi.fn().mockReturnThis(),
    };

    startNotificationDeadlineWorker.mockReturnValue(worker);
    startScheduledCronTaskWorker.mockReturnValue(worker);

    await import('./worker.job');

    expect(assertRedisConfigured).toHaveBeenCalledWith('worker');
    expect(startNotificationDeadlineWorker).toHaveBeenCalledOnce();
    expect(startScheduledCronTaskWorker).toHaveBeenCalledOnce();
  });
});
