import { randomUUID } from 'crypto';
import {
  NotificationOutboxStatus,
  Prisma,
} from '@prisma/client';
import { runtimeConfig } from '../../config/runtime';
import { nowUtc } from '../../utils/date';
import { NotFoundError } from '../../utils/errors';
import { ListNotificationsQueryDto } from '../../schemas/notification.schema';
import { AuthPayload } from '../../types/auth.type';
import { NotificationListResponse } from '../../types/notification.type';
import {
  publishPendingNotificationOutbox,
  prisma,
} from './notification-core.service';
import {
  type NotificationDeadlineJob,
} from './notification-queue.service';
import {
  mapNotificationRecord,
  getNotificationKind,
} from './notification-response.mapper';

const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const processDeadlineReminderScan = async (_options?: {
  userIds?: string[];
  queueOnly?: boolean;
}): Promise<void> => {
  // Deadline scanning for expected_approval_date has been removed.
};

export const syncDeadlineNotificationsForUser = async (
  _user: AuthPayload
): Promise<void> => {
  // No-op
};

export const syncDeadlineNotificationsForAllUsers = async (): Promise<void> => {
  // No-op
};

export const enqueueDeadlineReminderScan = async (): Promise<void> => {
  // No-op
};

export const deleteExpiredNotifications = async (now = nowUtc()) => {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_MS);

  return prisma.notification.deleteMany({
    where: {
      created_at: {
        lt: cutoff,
      },
    },
  });
};

export const processDeadlineQueueJob = async (job: NotificationDeadlineJob) => {
  if (job.kind === 'scan') {
    return;
  }

  if (job.kind === 'outbox-flush') {
    await publishPendingNotificationOutbox();
    return;
  }

  if (job.kind === 'cleanup') {
    await deleteExpiredNotifications();
    return;
  }
};

export const getNotificationRealtimeBootstrap = async (user: AuthPayload) => {
  const unreadCount = await prisma.notification.count({
    where: {
      user_id: user.id,
      is_read: false,
    },
  });

  return {
    polling_fallback_ms: runtimeConfig.pollingFallbackMs,
    realtime_enabled: runtimeConfig.realtimeEnabled,
    unread_count: unreadCount,
  };
};

export const listNotifications = async (
  user: AuthPayload,
  query: ListNotificationsQueryDto
): Promise<NotificationListResponse> => {
  const where: Prisma.NotificationWhereInput = {
    user_id: user.id,
    ...(query.needs_action !== undefined
      ? { requires_action: query.needs_action }
      : {}),
  };

  let paginationWhere: Prisma.NotificationWhereInput = where;
  if (query.cursor) {
    const cursorItem = await prisma.notification.findFirst({
      where: {
        id: query.cursor,
        user_id: user.id,
      },
      select: {
        id: true,
        created_at: true,
      },
    });

    if (cursorItem) {
      paginationWhere = {
        AND: [
          where,
          {
            OR: [
              { created_at: { lt: cursorItem.created_at } },
              {
                created_at: cursorItem.created_at,
                id: { lt: cursorItem.id },
              },
            ],
          },
        ],
      };
    }
  }

  const items = await prisma.notification.findMany({
    where: paginationWhere,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      user_id: user.id,
      is_read: false,
    },
  });

  const hasMore = items.length > query.limit;
  const sliced = hasMore ? items.slice(0, query.limit) : items;

  return {
    items: sliced.map(mapNotificationRecord),
    unread_count: unreadCount,
    has_more: hasMore,
    next_cursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
  };
};

export const markNotificationRead = async (
  user: AuthPayload,
  notificationId: string
) => {
  const updatedNotification = await prisma.$transaction(async (tx) => {
    const notification = await tx.notification.findFirst({
      where: {
        id: notificationId,
        user_id: user.id,
      },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    const updated = await tx.notification.update({
      where: { id: notification.id },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });

    const unreadCount = await tx.notification.count({
      where: {
        user_id: user.id,
        is_read: false,
      },
    });

    await tx.notificationOutbox.create({
      data: {
        id: randomUUID(),
        notification_id: updated.id,
        user_id: user.id,
        event_type: 'notification.updated',
        payload: mapNotificationRecord(updated) as any,
        unread_count: unreadCount,
        status: NotificationOutboxStatus.PENDING,
        updated_at: nowUtc(),
      },
    });

    return updated;
  });

  await publishPendingNotificationOutbox({
    notificationIds: [updatedNotification.id],
  });

  return updatedNotification;
};

export const markAllNotificationsRead = async (user: AuthPayload) => {
  const notificationIds = await prisma.$transaction(async (tx) => {
    const unreadNotifications = await tx.notification.findMany({
      where: {
        user_id: user.id,
        is_read: false,
      },
      select: {
        id: true,
      },
    });

    if (unreadNotifications.length === 0) {
      return [];
    }

    const ids = unreadNotifications.map((item) => item.id);

    await tx.notification.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });

    const updatedNotifications = await tx.notification.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    for (const notification of updatedNotifications) {
      await tx.notificationOutbox.create({
        data: {
          id: randomUUID(),
          notification_id: notification.id,
          user_id: user.id,
          event_type: 'notification.updated',
          payload: mapNotificationRecord(notification) as any,
          unread_count: 0,
          status: NotificationOutboxStatus.PENDING,
          updated_at: nowUtc(),
        },
      });
    }

    return ids;
  });

  if (notificationIds.length === 0) {
    return;
  }

  await publishPendingNotificationOutbox({
    notificationIds,
  });
};

export { getNotificationKind };
