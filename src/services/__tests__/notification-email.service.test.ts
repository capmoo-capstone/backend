import { NotificationDeliveryStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notificationEmailTransport,
  sendHelloTestEmail,
} from '../notification/notification-email.service';

describe('notification-email.service', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;
  const originalReplyTo = process.env.RESEND_REPLY_TO;
  const originalTestTo = process.env.RESEND_TEST_TO;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM = 'NexusProcure <onboarding@resend.dev>';
    process.env.RESEND_REPLY_TO = '';
    process.env.RESEND_TEST_TO = 'fallback@example.com';
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
        body: JSON.stringify({
          from: 'NexusProcure <onboarding@resend.dev>',
          to: ['person@example.com'],
          subject: 'NexusProcure test email',
          text: 'hello test email',
        }),
      })
    );
  });

  it('uses RESEND_TEST_TO when no explicit recipient is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendHelloTestEmail();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        body: JSON.stringify({
          from: 'NexusProcure <onboarding@resend.dev>',
          to: ['fallback@example.com'],
          subject: 'NexusProcure test email',
          text: 'hello test email',
        }),
      })
    );
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
