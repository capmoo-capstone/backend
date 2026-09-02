import { describe, expect, it, vi } from 'vitest';
import {
  processDeadlineNotifications,
  sendContractCommitteeReminderEmail,
  sendDailySummaryEmail,
  sendTestEmail,
  sendVendorPoEmail,
} from './cron.controller';
import * as CronTaskService from '../services/cron/cron-task.service';
import * as NotificationEmailService from '../services/notification/notification-email.service';

describe('processDeadlineNotifications', () => {
  it('enqueues the deadline sync task and returns a success response', async () => {
    const syncSpy = vi
      .spyOn(CronTaskService, 'triggerDeadlineReminderScan')
      .mockResolvedValue({
        message: 'Deadline notification sync enqueued',
      });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await processDeadlineNotifications({} as any, { status } as any);

    expect(syncSpy).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Deadline notification sync enqueued',
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
  it('enqueues the daily summary job and returns the queue state', async () => {
    const sendSpy = vi
      .spyOn(CronTaskService, 'triggerScheduledCronTask')
      .mockResolvedValue({
        message: 'daily-summary-email job enqueued',
        queued: true,
        skipped: false,
      });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await sendDailySummaryEmail({} as any, { status } as any);

    expect(sendSpy).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'daily-summary-email job enqueued',
      queued: true,
      skipped: false,
    });
  });
});

describe('sendContractCommitteeReminderEmail', () => {
  it('enqueues the contract committee reminder job and returns the queue state', async () => {
    const sendSpy = vi
      .spyOn(CronTaskService, 'triggerScheduledCronTask')
      .mockResolvedValue({
        message: 'contract-committee-reminders job enqueued',
        queued: true,
        skipped: false,
      });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await sendContractCommitteeReminderEmail({} as any, { status } as any);

    expect(sendSpy).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      message: 'contract-committee-reminders job enqueued',
      queued: true,
      skipped: false,
    });
  });
});
