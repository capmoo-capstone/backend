import { describe, expect, it, vi } from 'vitest';
import { processDeadlineNotifications } from './cron.controller';
import * as NotificationService from '../services/notification/notification.service';

describe('processDeadlineNotifications', () => {
  it('runs the existing deadline sync and returns a success response', async () => {
    const syncSpy = vi
      .spyOn(NotificationService, 'enqueueDeadlineReminderScan')
      .mockResolvedValue(undefined);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await processDeadlineNotifications({} as any, { status } as any);

    expect(syncSpy).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Deadline notification sync completed',
    });
  });
});
