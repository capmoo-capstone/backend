import { describe, expect, it, vi } from 'vitest';

const queueAdd = vi.fn();
const enqueueDeadlineScan = vi.fn();
const enqueueNotificationOutboxFlush = vi.fn();
const enqueueNotificationCleanup = vi.fn();
const startNotificationDeadlineWorker = vi.fn();
const getDeadlineQueue = vi.fn();

vi.mock('../config/runtime', () => ({
  runtimeConfig: {
    deadlineWorkerRepeatMs: 300000,
    outboxWorkerRepeatMs: 30000,
    notificationCleanupRepeatMs: 86400000,
  },
}));

vi.mock('../services/notification/notification-queue.service', () => ({
  enqueueDeadlineScan,
  enqueueNotificationCleanup,
  enqueueNotificationOutboxFlush,
  getDeadlineQueue,
  startNotificationDeadlineWorker,
}));

vi.mock('../services/notification/notification-query.service', () => ({
  processDeadlineQueueJob: vi.fn(),
}));

describe('notification-worker.job', () => {
  it('schedules repeat cleanup and enqueues an immediate cleanup run', async () => {
    queueAdd.mockResolvedValue(undefined);
    enqueueDeadlineScan.mockResolvedValue(undefined);
    enqueueNotificationOutboxFlush.mockResolvedValue(undefined);
    enqueueNotificationCleanup.mockResolvedValue(undefined);
    startNotificationDeadlineWorker.mockReturnValue({
      on: vi.fn().mockReturnThis(),
    });
    getDeadlineQueue.mockReturnValue({
      add: queueAdd,
    });

    await import('./notification-worker.job');

    expect(queueAdd).toHaveBeenNthCalledWith(
      3,
      'cleanup',
      { kind: 'cleanup' },
      expect.objectContaining({
        jobId: 'notification-cleanup-repeat',
        repeat: { every: 86400000 },
      })
    );
    expect(enqueueNotificationCleanup).toHaveBeenCalledOnce();
  });
});
