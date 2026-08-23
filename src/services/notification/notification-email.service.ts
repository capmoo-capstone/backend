import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';

const RESEND_API_URL = 'https://api.resend.com/emails';

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
};

export interface EmailDeliveryDraft {
  userId: string;
  notificationId?: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  dedupeKey?: string | null;
  recipientEmail?: string | null;
}

export interface EmailDeliveryResult {
  status: NotificationDeliveryStatus;
  errorMessage?: string | null;
  sentAt?: Date | null;
}

export interface NotificationEmailTransport {
  queue(draft: EmailDeliveryDraft): Promise<EmailDeliveryResult>;
}

const getResendConfig = () => ({
  apiKey: process.env.RESEND_API_KEY?.trim() || '',
  from: process.env.RESEND_FROM?.trim() || '',
  replyTo: process.env.RESEND_REPLY_TO?.trim() || '',
  testTo: process.env.RESEND_TEST_TO?.trim() || '',
});

const sendResendEmail = async (payload: ResendEmailPayload) => {
  const { apiKey } = getResendConfig();
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return;
  }

  let message = `Resend request failed with status ${response.status}`;

  try {
    const data = (await response.json()) as {
      message?: string;
      error?: { message?: string };
    };
    message = data.error?.message || data.message || message;
  } catch {
    // Keep the default message when the provider body is unavailable.
  }

  throw new Error(message);
};

export const sendHelloTestEmail = async (to?: string | null) => {
  const { apiKey, from, replyTo, testTo } = getResendConfig();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!from) {
    throw new Error('RESEND_FROM is not configured');
  }

  const recipient = to?.trim() || testTo;
  if (!recipient) {
    throw new Error('A recipient email is required');
  }

  await sendResendEmail({
    from,
    to: [recipient],
    subject: 'NexusProcure test email',
    text: 'hello test email',
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
};

class ResendNotificationEmailTransport implements NotificationEmailTransport {
  async queue(draft: EmailDeliveryDraft): Promise<EmailDeliveryResult> {
    const { apiKey, from, replyTo } = getResendConfig();
    const recipient = draft.recipientEmail?.trim() || '';

    if (!recipient) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
        errorMessage: 'Recipient email is missing',
      };
    }

    if (!apiKey) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
        errorMessage: 'RESEND_API_KEY is not configured',
      };
    }

    if (!from) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
        errorMessage: 'RESEND_FROM is not configured',
      };
    }

    try {
      await sendResendEmail({
        from,
        to: [recipient],
        subject: draft.subject,
        text: draft.body,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      return {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
      };
    } catch (error) {
      return {
        status: NotificationDeliveryStatus.FAILED,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown email failure',
      };
    }
  }
}

export const notificationEmailTransport: NotificationEmailTransport =
  new ResendNotificationEmailTransport();
