import { describe, expect, it, vi } from 'vitest';
import {
  processDeadlineNotifications,
  sendTestEmail,
} from './cron.controller';
import * as NotificationService from '../services/notification/notification.service';
import * as NotificationEmailService from '../services/notification/notification-email.service';

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

describe('sendTestEmail', () => {
  it('sends a test email to the explicit query recipient', async () => {
    const sendSpy = vi
      .spyOn(NotificationEmailService, 'sendHelloTestEmail')
      .mockResolvedValue(undefined);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await sendTestEmail(
      { query: { to: 'person@example.com' } } as any,
      { status } as any
    );

    expect(sendSpy).toHaveBeenCalledWith('person@example.com');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Test email sent',
      to: 'person@example.com',
    });
  });
});
