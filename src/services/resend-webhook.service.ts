import { NotificationDeliveryStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { rejectCompletedSubmissionForEmailFailure } from './submission-email-failure.service';

const EVENT_STATUS = {
  'email.sent': NotificationDeliveryStatus.SENT,
  'email.delivered': NotificationDeliveryStatus.DELIVERED,
  'email.delivery_delayed': NotificationDeliveryStatus.DELAYED,
  'email.bounced': NotificationDeliveryStatus.BOUNCED,
  'email.failed': NotificationDeliveryStatus.FAILED,
  'email.complained': NotificationDeliveryStatus.COMPLAINED,
  'email.suppressed': NotificationDeliveryStatus.SUPPRESSED,
} as const;

const TERMINAL_FAILURE_STATUSES = new Set<NotificationDeliveryStatus>([
  NotificationDeliveryStatus.FAILED,
  NotificationDeliveryStatus.BOUNCED,
  NotificationDeliveryStatus.SUPPRESSED,
]);

const STATUS_RANK: Record<NotificationDeliveryStatus, number> = {
  PENDING: 0,
  SKIPPED: 1,
  SENT: 2,
  DELAYED: 3,
  DELIVERED: 4,
  COMPLAINED: 5,
  BOUNCED: 6,
  FAILED: 6,
  SUPPRESSED: 6,
};

type SupportedEventType = keyof typeof EVENT_STATUS;

export type ResendWebhookEvent = {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
    bounce?: { message?: string; type?: string; subType?: string };
    failed?: { reason?: string };
    suppressed?: {
      diagnosticCode?: string[];
      message?: string;
      reason?: string;
      type?: string;
    };
    error?: { message?: string; name?: string } | string;
    suppression?: { reason?: string };
    reason?: string;
    message?: string;
    [key: string]: unknown;
  };
};

const getTag = (event: ResendWebhookEvent, name: string) => {
  const tags = event.data.tags;
  if (Array.isArray(tags)) {
    return tags.find((tag) => tag.name === name)?.value;
  }
  return tags?.[name];
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export const extractResendStatusDetail = (event: ResendWebhookEvent) => {
  const error = event.data.error;
  return firstText(
    event.data.bounce?.message,
    event.data.bounce?.type,
    event.data.failed?.reason,
    event.data.suppressed?.message,
    event.data.suppressed?.reason,
    event.data.suppressed?.type,
    typeof error === 'string' ? error : error?.message,
    typeof error === 'string' ? null : error?.name,
    event.data.suppression?.reason,
    event.data.reason,
    event.data.message
  );
};

export const processResendWebhookEvent = async (
  event: ResendWebhookEvent,
  svixEventId: string
) => {
  const incomingStatus = EVENT_STATUS[event.type as SupportedEventType];
  if (!incomingStatus) {
    return { handled: false, reason: 'unsupported_event' as const };
  }

  const eventAt = new Date(event.created_at);
  if (Number.isNaN(eventAt.getTime())) {
    throw new Error('Resend webhook created_at is invalid');
  }

  const resendEmailId = event.data.email_id?.trim() || null;
  const notificationDeliveryId =
    getTag(event, 'notification_delivery_id')?.trim() || null;
  const detail = extractResendStatusDetail(event);

  const candidate = await prisma.$transaction(async (tx) => {
    const delivery = resendEmailId
      ? await tx.notificationDelivery.findFirst({
          where: { provider_message_id: resendEmailId },
        })
      : null;
    const matchedDelivery =
      delivery ||
      (notificationDeliveryId
        ? await tx.notificationDelivery.findUnique({
            where: { id: notificationDeliveryId },
          })
        : null);

    if (!matchedDelivery) {
      return { applied: false, reason: 'unknown_email' as const };
    }
    if (matchedDelivery.latest_svix_event_id === svixEventId) {
      return { applied: false, reason: 'duplicate_event' as const };
    }
    const hasProcessedWebhook = Boolean(matchedDelivery.latest_svix_event_id);
    if (hasProcessedWebhook && matchedDelivery.status_at > eventAt) {
      return { applied: false, reason: 'stale_event' as const };
    }
    if (
      hasProcessedWebhook &&
      matchedDelivery.status_at.getTime() === eventAt.getTime() &&
      STATUS_RANK[incomingStatus] < STATUS_RANK[matchedDelivery.status]
    ) {
      return { applied: false, reason: 'regressive_event' as const };
    }

    return {
      ready: true,
      notificationDeliveryId: matchedDelivery.id,
      shouldStoreResendId: Boolean(
        resendEmailId && !matchedDelivery.provider_message_id
      ),
      submissionId: matchedDelivery.submission_id,
      status: incomingStatus,
    };
  });

  if (
    candidate.ready &&
    candidate.submissionId &&
    TERMINAL_FAILURE_STATUSES.has(candidate.status)
  ) {
    await rejectCompletedSubmissionForEmailFailure({
      submissionId: candidate.submissionId,
      reason: detail || `Resend reported ${event.type}`,
      occurredAt: eventAt,
    });
  }

  if (!candidate.ready) {
    return { handled: true, ...candidate };
  }

  const updated = await prisma.notificationDelivery.updateMany({
    where: {
      id: candidate.notificationDeliveryId,
      OR: [
        { latest_svix_event_id: null },
        {
          latest_svix_event_id: { not: svixEventId },
          status_at: { lte: eventAt },
        },
      ],
    },
    data: {
      status: incomingStatus,
      status_at: eventAt,
      latest_svix_event_id: svixEventId,
      error_message: detail,
      ...(incomingStatus === NotificationDeliveryStatus.DELIVERED
        ? { delivered_at: eventAt }
        : {}),
      ...(incomingStatus === NotificationDeliveryStatus.BOUNCED
        ? { bounced_at: eventAt }
        : {}),
      ...(candidate.shouldStoreResendId
        ? { provider_message_id: resendEmailId }
        : {}),
    },
  });

  return {
    handled: true,
    applied: updated.count > 0,
    ...(updated.count > 0
      ? {}
      : { reason: 'concurrent_or_stale_event' as const }),
    submissionId: candidate.submissionId,
    status: candidate.status,
  };
};
