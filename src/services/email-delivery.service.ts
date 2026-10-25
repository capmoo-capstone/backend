import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { EmailKind } from '../types/email-delivery.type';

const RESEND_API_URL = 'https://api.resend.com/emails';

type ResendTag = {
  name: string;
  value: string;
};

type TrackedEmailInput = {
  kind: EmailKind;
  recipient: string;
  subject: string;
  text: string;
  html?: string;
  submissionId?: string | null;
  notificationDeliveryId?: string | null;
  notificationId?: string | null;
  userId?: string | null;
  dedupeKey?: string | null;
  channel?: NotificationChannel;
};

export type TrackedEmailResult = {
  notificationDeliveryId: string;
  resendEmailId: string | null;
  status: NotificationDeliveryStatus;
  sentAt: Date;
};

export class EmailDeliverySendError extends Error {
  constructor(
    message: string,
    public readonly notificationDeliveryId: string,
    public readonly status: NotificationDeliveryStatus
  ) {
    super(message);
    this.name = 'EmailDeliverySendError';
  }
}

const getResendConfig = () => ({
  apiKey: process.env.RESEND_API_KEY?.trim() ?? '',
  from: process.env.RESEND_FROM?.trim() ?? '',
});

const readProviderError = async (response: Response) => {
  let message = `Resend request failed with status ${response.status}`;

  try {
    const data = (await response.json()) as {
      message?: string;
      error?: { message?: string };
    };
    message = data.error?.message || data.message || message;
  } catch {
    // Preserve the status-based fallback when Resend does not return JSON.
  }

  return message;
};

const markSendFailure = async (
  notificationDeliveryId: string,
  status: NotificationDeliveryStatus,
  detail: string,
  statusAt: Date
) => {
  await prisma.notificationDelivery.updateMany({
    where: {
      id: notificationDeliveryId,
      status: NotificationDeliveryStatus.PENDING,
    },
    data: {
      status,
      status_at: statusAt,
      error_message: detail,
    },
  });
};

const reserveDelivery = async (input: TrackedEmailInput, recipient: string) => {
  const data = {
    recipient_email: recipient,
    channel: input.channel ?? NotificationChannel.EMAIL_IMMEDIATE,
    email_type: input.kind,
    status: NotificationDeliveryStatus.PENDING,
    status_at: new Date(),
    subject: input.subject,
    body: input.text,
    submission_id: input.submissionId ?? null,
    user_id: input.userId ?? null,
    notification_id: input.notificationId ?? null,
    dedupe_key: input.dedupeKey ?? null,
    provider_message_id: null,
    latest_svix_event_id: null,
    error_message: null,
    sent_at: null,
    delivered_at: null,
    bounced_at: null,
  };

  if (input.notificationDeliveryId) {
    return prisma.notificationDelivery.update({
      where: { id: input.notificationDeliveryId },
      data,
      select: { id: true },
    });
  }

  return prisma.notificationDelivery.create({
    data,
    select: { id: true },
  });
};

export const sendTrackedEmail = async (
  input: TrackedEmailInput
): Promise<TrackedEmailResult> => {
  const recipient = input.recipient.trim();
  const pending = await reserveDelivery(input, recipient);

  const { apiKey, from } = getResendConfig();
  const configurationError = !apiKey
    ? 'RESEND_API_KEY is not configured'
    : !from
      ? 'RESEND_FROM is not configured'
      : !recipient
        ? 'A recipient email is required'
        : null;

  if (configurationError) {
    const failedAt = new Date();
    await markSendFailure(
      pending.id,
      NotificationDeliveryStatus.SKIPPED,
      configurationError,
      failedAt
    );
    throw new EmailDeliverySendError(
      configurationError,
      pending.id,
      NotificationDeliveryStatus.SKIPPED
    );
  }

  const tags: ResendTag[] = [
    { name: 'notification_delivery_id', value: pending.id },
  ];
  if (input.submissionId) {
    tags.push({ name: 'submission_id', value: input.submissionId });
  }

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        tags,
      }),
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Unknown Resend request failure';
    await markSendFailure(
      pending.id,
      NotificationDeliveryStatus.FAILED,
      detail,
      new Date()
    );
    throw new EmailDeliverySendError(
      detail,
      pending.id,
      NotificationDeliveryStatus.FAILED
    );
  }

  if (!response.ok) {
    const detail = await readProviderError(response);
    await markSendFailure(
      pending.id,
      NotificationDeliveryStatus.FAILED,
      detail,
      new Date()
    );
    throw new EmailDeliverySendError(
      detail,
      pending.id,
      NotificationDeliveryStatus.FAILED
    );
  }

  let resendEmailId: string | null = null;
  try {
    const data = (await response.json()) as { id?: string };
    resendEmailId = data.id?.trim() || null;
  } catch {
    // A successful response without a readable body remains accepted by Resend.
  }

  const sentAt = new Date();
  try {
    const updated = await prisma.notificationDelivery.updateMany({
      where: {
        id: pending.id,
        status: NotificationDeliveryStatus.PENDING,
      },
      data: {
        status: NotificationDeliveryStatus.SENT,
        status_at: sentAt,
        sent_at: sentAt,
        provider_message_id: resendEmailId,
        error_message: null,
      },
    });

    // A webhook may have advanced the status before the send response arrived.
    if (updated.count === 0 && resendEmailId) {
      await prisma.notificationDelivery.updateMany({
        where: {
          id: pending.id,
          provider_message_id: null,
        },
        data: { provider_message_id: resendEmailId },
      });
    }
  } catch (error) {
    // Resend already accepted the message. Do not report this as a send failure;
    // the signed webhook can repair the record by its correlation tag.
    console.error('Failed to persist accepted Resend response', {
      notificationDeliveryId: pending.id,
      resendEmailId,
      error,
    });
  }

  return {
    notificationDeliveryId: pending.id,
    resendEmailId,
    status: NotificationDeliveryStatus.SENT,
    sentAt,
  };
};
