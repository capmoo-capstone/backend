import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';

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

class PausedNotificationEmailTransport implements NotificationEmailTransport {
  async queue(_draft: EmailDeliveryDraft): Promise<EmailDeliveryResult> {
    return {
      status: NotificationDeliveryStatus.SKIPPED,
      errorMessage: 'Email delivery is paused in this version',
    };
  }
}

export const notificationEmailTransport: NotificationEmailTransport =
  new PausedNotificationEmailTransport();
