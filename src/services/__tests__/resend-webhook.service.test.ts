import { NotificationDeliveryStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, txMock } from '../../test/prisma-mock';
import {
  processResendWebhookEvent,
  ResendWebhookEvent,
} from '../resend-webhook.service';
import { rejectCompletedSubmissionForEmailFailure } from '../submission-email-failure.service';

vi.mock('../submission-email-failure.service', () => ({
  rejectCompletedSubmissionForEmailFailure: vi.fn().mockResolvedValue(true),
}));

const event = (
  type: string,
  data: ResendWebhookEvent['data'] = { email_id: 'resend-1' },
  createdAt = '2026-10-25T12:00:00.000Z'
): ResendWebhookEvent => ({ type, created_at: createdAt, data });

const log = (overrides: Record<string, unknown> = {}) => ({
  id: 'notification-delivery-1',
  provider_message_id: 'resend-1',
  submission_id: 'submission-1',
  status: NotificationDeliveryStatus.SENT,
  status_at: new Date('2026-10-25T11:00:00.000Z'),
  latest_svix_event_id: null,
  ...overrides,
});

describe('resend-webhook.service', () => {
  beforeEach(() => {
    vi.mocked(rejectCompletedSubmissionForEmailFailure).mockClear();
    txMock.notificationDelivery.findFirst.mockResolvedValue(log());
    prismaMock.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each([
    ['email.sent', NotificationDeliveryStatus.SENT],
    ['email.delivered', NotificationDeliveryStatus.DELIVERED],
    ['email.delivery_delayed', NotificationDeliveryStatus.DELAYED],
    ['email.complained', NotificationDeliveryStatus.COMPLAINED],
  ])('maps %s without rejecting the submission', async (type, status) => {
    await processResendWebhookEvent(event(type), `svix-${type}`);

    expect(prismaMock.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'notification-delivery-1' }),
      data: expect.objectContaining({
        status,
        latest_svix_event_id: `svix-${type}`,
      }),
    });
    expect(rejectCompletedSubmissionForEmailFailure).not.toHaveBeenCalled();
  });

  it.each([
    [
      'email.failed',
      NotificationDeliveryStatus.FAILED,
      { failed: { reason: 'reached_daily_quota' } },
      'reached_daily_quota',
    ],
    [
      'email.bounced',
      NotificationDeliveryStatus.BOUNCED,
      { bounce: { message: 'Mailbox unavailable' } },
      'Mailbox unavailable',
    ],
    [
      'email.suppressed',
      NotificationDeliveryStatus.SUPPRESSED,
      {
        suppressed: {
          message: 'Address is suppressed',
          reason: 'previous_bounce',
          type: 'Suppressed',
        },
      },
      'Address is suppressed',
    ],
  ])(
    'rejects the linked submission for %s',
    async (type, status, data, reason) => {
      await processResendWebhookEvent(
        event(type, {
          email_id: 'resend-1',
          ...data,
        }),
        `svix-${type}`
      );

      expect(prismaMock.notificationDelivery.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'notification-delivery-1' }),
        data: expect.objectContaining({
          status,
          error_message: reason,
        }),
      });
      expect(rejectCompletedSubmissionForEmailFailure).toHaveBeenCalledWith({
        submissionId: 'submission-1',
        reason,
        occurredAt: new Date('2026-10-25T12:00:00.000Z'),
      });
    }
  );

  it('accepts the first provider event when the local send timestamp is newer', async () => {
    txMock.notificationDelivery.findFirst.mockResolvedValueOnce(
      log({ status_at: new Date('2026-10-25T13:00:00.000Z') })
    );

    await processResendWebhookEvent(
      event('email.failed', {
        email_id: 'resend-1',
        failed: { reason: 'reached_daily_quota' },
      }),
      'svix-first-provider-event'
    );

    expect(prismaMock.notificationDelivery.updateMany).toHaveBeenCalledOnce();
    expect(rejectCompletedSubmissionForEmailFailure).toHaveBeenCalledOnce();
  });

  it('falls back to the exact notification_delivery_id tag and stores the Resend ID', async () => {
    txMock.notificationDelivery.findFirst.mockResolvedValueOnce(null);
    txMock.notificationDelivery.findUnique.mockResolvedValueOnce(
      log({ provider_message_id: null })
    );

    await processResendWebhookEvent(
      event('email.delivered', {
        email_id: 'resend-race',
        tags: {
          notification_delivery_id: 'notification-delivery-1',
          submission_id: 'submission-1',
        },
      }),
      'svix-race'
    );

    expect(txMock.notificationDelivery.findUnique).toHaveBeenCalledWith({
      where: { id: 'notification-delivery-1' },
    });
    expect(prismaMock.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider_message_id: 'resend-race',
        }),
      })
    );
  });

  it('ignores duplicate and stale deliveries without notifying again', async () => {
    txMock.notificationDelivery.findFirst.mockResolvedValueOnce(
      log({ latest_svix_event_id: 'svix-duplicate' })
    );
    await processResendWebhookEvent(event('email.bounced'), 'svix-duplicate');

    txMock.notificationDelivery.findFirst.mockResolvedValueOnce(
      log({
        status_at: new Date('2026-10-25T13:00:00.000Z'),
        latest_svix_event_id: 'svix-newer',
      })
    );
    await processResendWebhookEvent(event('email.failed'), 'svix-stale');

    expect(prismaMock.notificationDelivery.updateMany).not.toHaveBeenCalled();
    expect(rejectCompletedSubmissionForEmailFailure).not.toHaveBeenCalled();
  });

  it('leaves a terminal event unprocessed when rejection fails so Resend can retry', async () => {
    vi.mocked(rejectCompletedSubmissionForEmailFailure).mockRejectedValueOnce(
      new Error('system actor unavailable')
    );

    await expect(
      processResendWebhookEvent(event('email.failed'), 'svix-retry')
    ).rejects.toThrow('system actor unavailable');

    expect(prismaMock.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('returns 200-compatible ignored results for unsupported and unknown events', async () => {
    expect(
      await processResendWebhookEvent(event('email.opened'), 'svix-opened')
    ).toMatchObject({ handled: false, reason: 'unsupported_event' });

    txMock.notificationDelivery.findFirst.mockResolvedValue(null);
    txMock.notificationDelivery.findUnique.mockResolvedValue(null);
    expect(
      await processResendWebhookEvent(
        event('email.failed', {
          tags: { submission_id: 'submission-1' },
        }),
        'svix-unknown'
      )
    ).toMatchObject({ handled: true, applied: false, reason: 'unknown_email' });
    expect(rejectCompletedSubmissionForEmailFailure).not.toHaveBeenCalled();
  });
});
