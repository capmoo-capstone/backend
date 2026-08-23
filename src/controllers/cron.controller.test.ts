import { describe, expect, it, vi } from 'vitest';
import {
  processDeadlineNotifications,
  sendDailySummaryEmail,
  sendTestEmail,
  sendVendorPoEmail,
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

describe('sendVendorPoEmail', () => {
  it('sends the vendor PO email for the requested project', async () => {
    const sendSpy = vi
      .spyOn(NotificationEmailService, 'sendVendorPoRequestEmailForProject')
      .mockResolvedValue({
        projectId: 'project-1',
        poNumber: 'PO-001',
        recipientEmail: 'vendor@example.com',
      });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await sendVendorPoEmail(
      { body: { projectId: 'project-1' } } as any,
      { status } as any
    );

    expect(sendSpy).toHaveBeenCalledWith('project-1');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Vendor PO email sent',
      projectId: 'project-1',
      poNumber: 'PO-001',
      to: 'vendor@example.com',
    });
  });
});

describe('sendDailySummaryEmail', () => {
  it('sends weekday good-morning emails to ops users and returns the recipient count', async () => {
    const sendSpy = vi
      .spyOn(NotificationEmailService, 'sendDailySummaryEmailsToOpsUsers')
      .mockResolvedValue({ recipientCount: 2 });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await sendDailySummaryEmail({} as any, { status } as any);

    expect(sendSpy).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Daily summary emails sent',
      recipientCount: 2,
    });
  });
});

