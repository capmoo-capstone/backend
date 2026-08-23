import { NotificationDeliveryStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from '../../test/prisma-mock';
import {
  notificationEmailTransport,
  sendDailySummaryEmailsToOpsUsers,
  sendHelloTestEmail,
  sendRegistrationApprovedEmail,
  sendRegistrationPendingEmail,
  sendVendorPoRequestEmailForProject,
} from '../notification/notification-email.service';

const getSentPayload = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(options.body) as {
    from: string;
    to: string[];
    subject: string;
    text: string;
  };
};

describe('notification-email.service', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;
  const originalReplyTo = process.env.RESEND_REPLY_TO;
  const originalTestTo = process.env.RESEND_TEST_TO;
  const originalAppPublicUrl = process.env.APP_PUBLIC_URL;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM = 'NexusProcure <onboarding@resend.dev>';
    process.env.RESEND_REPLY_TO = '';
    process.env.RESEND_TEST_TO = 'fallback@example.com';
    process.env.APP_PUBLIC_URL = 'https://nexus-procure.com';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }

    if (originalFrom === undefined) {
      delete process.env.RESEND_FROM;
    } else {
      process.env.RESEND_FROM = originalFrom;
    }

    if (originalReplyTo === undefined) {
      delete process.env.RESEND_REPLY_TO;
    } else {
      process.env.RESEND_REPLY_TO = originalReplyTo;
    }

    if (originalTestTo === undefined) {
      delete process.env.RESEND_TEST_TO;
    } else {
      process.env.RESEND_TEST_TO = originalTestTo;
    }

    if (originalAppPublicUrl === undefined) {
      delete process.env.APP_PUBLIC_URL;
    } else {
      process.env.APP_PUBLIC_URL = originalAppPublicUrl;
    }

    vi.unstubAllGlobals();
  });

  it('sends a test email with the explicit recipient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendHelloTestEmail('person@example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(getSentPayload(fetchMock)).toEqual({
      from: 'NexusProcure <onboarding@resend.dev>',
      to: ['person@example.com'],
      subject: 'NexusProcure test email',
      text: 'hello test email',
    });
  });

  it('uses RESEND_TEST_TO when no explicit recipient is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendHelloTestEmail();

    expect(getSentPayload(fetchMock)).toEqual({
      from: 'NexusProcure <onboarding@resend.dev>',
      to: ['fallback@example.com'],
      subject: 'NexusProcure test email',
      text: 'hello test email',
    });
  });

  it('renders the approved registration email with the login URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendRegistrationApprovedEmail({
      fullName: 'สมชาย ใจดี',
      email: 'somchai@example.com',
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.subject).toBe(
      'บัญชีของคุณได้รับการอนุมัติแล้ว – เข้าสู่ระบบได้ทันที'
    );
    expect(payload.to).toEqual(['somchai@example.com']);
    expect(payload.text).toContain('https://nexus-procure.com/login');
    expect(payload.text).toContain('สมชาย ใจดี');
  });

  it('renders the pending registration email in Thai', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendRegistrationPendingEmail({
      fullName: 'สมหญิง ใจดี',
      email: 'somying@example.com',
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.subject).toBe(
      'แจ้งสถานะการลงทะเบียน – อยู่ระหว่างรอการอนุมัติ'
    );
    expect(payload.to).toEqual(['somying@example.com']);
    expect(payload.text).toContain('ขอบคุณสำหรับการลงทะเบียน');
    expect(payload.text).toContain('สมหญิง ใจดี');
  });

  it('sends the vendor PO email from project data and includes the vendor form URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      po_no: 'PO-1234',
      vendor_email: 'vendor@example.com',
      vendor_name: 'Vendor Co., Ltd.',
    });

    const result = await sendVendorPoRequestEmailForProject('project-1');

    expect(result).toEqual({
      projectId: 'project-1',
      poNumber: 'PO-1234',
      recipientEmail: 'vendor@example.com',
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.subject).toBe(
      'รบกวนส่งเอกสารแนบสำหรับใบสั่งซื้อ PO #PO-1234'
    );
    expect(payload.to).toEqual(['vendor@example.com']);
    expect(payload.text).toContain('https://nexus-procure.com/vendor-form');
    expect(payload.text).toContain('PO #PO-1234');
  });

  it('fails clearly when the vendor email is missing from the project', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      po_no: 'PO-1234',
      vendor_email: null,
      vendor_name: 'Vendor Co., Ltd.',
    });

    await expect(
      sendVendorPoRequestEmailForProject('project-1')
    ).rejects.toThrow('Project vendor email is missing');
  });

  it('sends good-morning emails to active ops users and deduplicates email addresses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'ops1@example.com',
        full_name: 'Ops One',
      },
      {
        id: 'user-2',
        email: 'ops1@example.com',
        full_name: 'Ops Duplicate',
      },
      {
        id: 'user-3',
        email: 'ops2@example.com',
        full_name: 'Ops Two',
      },
    ]);

    const result = await sendDailySummaryEmailsToOpsUsers();

    expect(result).toEqual({ recipientCount: 2 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          is_active: true,
          email: { not: null },
          roles: {
            some: {
              dept_id: 'DEPT-SUP-OPS',
            },
          },
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks queued delivery as sent when Resend accepts it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notificationEmailTransport.queue({
      userId: 'user-1',
      channel: 'EMAIL_IMMEDIATE' as any,
      subject: 'Subject',
      body: 'Body',
      recipientEmail: 'person@example.com',
    });

    expect(result.status).toBe(NotificationDeliveryStatus.SENT);
    expect(result.sentAt).toBeInstanceOf(Date);
    expect(result.errorMessage).toBeNull();
  });

  it('skips queued delivery when the recipient email is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notificationEmailTransport.queue({
      userId: 'user-1',
      channel: 'EMAIL_IMMEDIATE' as any,
      subject: 'Subject',
      body: 'Body',
    });

    expect(result).toEqual({
      status: NotificationDeliveryStatus.SKIPPED,
      errorMessage: 'Recipient email is missing',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

