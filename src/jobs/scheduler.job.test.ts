import { describe, expect, it, vi } from 'vitest';

const registerNotificationQueueSchedules = vi.fn();
const enqueueDeadlineScan = vi.fn();
const enqueueNotificationOutboxFlush = vi.fn();
const enqueueNotificationCleanup = vi.fn();
const assertRedisConfigured = vi.fn();

vi.mock('../services/notification/notification-queue.service', () => ({
  DEADLINE_NOTIFICATION_QUEUE_NAME: 'notifications-deadline-reminders',
  registerNotificationQueueSchedules,
  enqueueDeadlineScan,
  enqueueNotificationOutboxFlush,
  enqueueNotificationCleanup,
}));
vi.mock('../services/queue/bullmq-runtime.service', () => ({ assertRedisConfigured }));
vi.mock('../utils/runtime-log', () => ({ logRuntimeEvent: vi.fn(), logRuntimeError: vi.fn() }));

describe('scheduler.job', () => {
  it('registers notification schedules and primes the notification queue', async () => {
    registerNotificationQueueSchedules.mockResolvedValue([]);
    enqueueDeadlineScan.mockResolvedValue(undefined);
    enqueueNotificationOutboxFlush.mockResolvedValue(undefined);
    enqueueNotificationCleanup.mockResolvedValue(undefined);

    await import('./scheduler.job');

    expect(assertRedisConfigured).toHaveBeenCalledWith('scheduler');
    expect(registerNotificationQueueSchedules).toHaveBeenCalledOnce();
    expect(enqueueDeadlineScan).toHaveBeenCalledOnce();
    expect(enqueueNotificationOutboxFlush).toHaveBeenCalledOnce();
    expect(enqueueNotificationCleanup).toHaveBeenCalledOnce();
  });
});
