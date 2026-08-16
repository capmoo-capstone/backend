import { randomUUID } from 'crypto';
import {
  Notification,
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationOutboxStatus,
  NotificationPriority,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { OPS_DEPT_ID } from '../../lib/constant';
import { nowUtc, toBangkokParts } from '../../lib/date';
import { NotFoundError } from '../../lib/errors';
import type {
  NotificationKind,
  NotificationListItemResponse,
  PersistedNotificationResult,
} from '../../types/notification.type';
import {
  notificationEmailTransport,
  type EmailDeliveryDraft,
} from './notification-email.service';
import { mapNotificationRecord } from './notification-response.mapper';
import { publishNotificationRealtimeEvent } from './notification-realtime.service';

export type TxClient = Prisma.TransactionClient;
type NotificationRealtimeEventType =
  | 'notification.created'
  | 'notification.updated';
type NotificationOutboxRow = {
  id: string;
  notification_id: string;
  user_id: string;
  event_type: NotificationRealtimeEventType;
  payload: unknown;
  unread_count: number;
};

const isUniqueConstraintError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
  );

export type NotificationDispatchInput = {
  recipient_ids: string[];
  actor_id?: string | null;
  project_id?: string | null;
  kind: NotificationKind;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  target_path?: string | null;
  action_label?: string | null;
  requires_action?: boolean;
  dedupe_key?: string | null;
  metadata?: Record<string, unknown> | null;
};

type RoleScope = {
  role: UserRole;
  unit_id?: string | null;
  dept_id?: string | null;
};

export const normalizePriorityRank = (priority: NotificationPriority) => {
  switch (priority) {
    case NotificationPriority.CRITICAL:
      return 0;
    case NotificationPriority.HIGH:
      return 1;
    case NotificationPriority.MEDIUM:
      return 2;
    case NotificationPriority.LOW:
    default:
      return 3;
  }
};

const toNullableJsonInput = (
  value?: Record<string, unknown> | null
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =>
  value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;

const buildNotificationMetadata = (input: NotificationDispatchInput) => ({
  ...(input.metadata ?? {}),
  notification_kind: input.kind,
});

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown notification publish failure';

const claimableOutboxStatuses: NotificationOutboxStatus[] = [
  NotificationOutboxStatus.PENDING,
  NotificationOutboxStatus.FAILED,
];

const toNotificationPayloadJson = (
  value: NotificationListItemResponse
): Prisma.InputJsonValue => value as unknown as Prisma.InputJsonValue;

const queueNotificationOutboxEvent = async (
  db: Pick<Prisma.TransactionClient, 'notificationOutbox'>,
  item: PersistedNotificationResult
) => {
  const eventType: NotificationRealtimeEventType =
    item.action === 'created' ? 'notification.created' : 'notification.updated';

  const now = nowUtc();
  await db.notificationOutbox.create({
    data: {
      id: randomUUID(),
      notification_id: item.notification.id,
      user_id: item.userId,
      event_type: eventType,
      payload: toNotificationPayloadJson(mapNotificationRecord(item.notification)),
      unread_count: item.unreadCount,
      created_at: now,
      updated_at: now,
    },
  });
};

const loadNotificationOutboxRows = async (
  db: Pick<PrismaClientLike, 'notificationOutbox'>,
  options?: {
    notificationIds?: string[];
    limit?: number;
  }
) => {
  const limit = options?.limit ?? 100;
  const rows = await db.notificationOutbox.findMany({
    where: {
      status: { in: claimableOutboxStatuses },
      ...(options?.notificationIds?.length
        ? {
            notification_id: {
              in: options.notificationIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      notification_id: true,
      user_id: true,
      event_type: true,
      payload: true,
      unread_count: true,
    },
    orderBy: {
      created_at: 'asc',
    },
    take: limit,
  });

  return rows.map((row) => ({
    ...row,
    event_type: row.event_type as NotificationRealtimeEventType,
    payload: row.payload as unknown as NotificationListItemResponse,
  }));
};

type PrismaClientLike = typeof prisma;

const claimNotificationOutboxRow = async (
  db: Pick<PrismaClientLike, 'notificationOutbox'>,
  id: string
) => {
  const now = nowUtc();
  const claimed = await db.notificationOutbox.updateMany({
    where: {
      id,
      status: {
        in: claimableOutboxStatuses,
      },
    },
    data: {
      status: NotificationOutboxStatus.PROCESSING,
      attempts: {
        increment: 1,
      },
      last_attempted_at: now,
      updated_at: now,
    },
  });

  return claimed.count > 0;
};

const markNotificationOutboxPublished = async (
  db: Pick<PrismaClientLike, 'notificationOutbox'>,
  id: string
) => {
  await db.notificationOutbox.update({
    where: { id },
    data: {
      status: NotificationOutboxStatus.PUBLISHED,
      published_at: nowUtc(),
      error_message: null,
    },
  });
};

const markNotificationOutboxFailed = async (
  db: Pick<PrismaClientLike, 'notificationOutbox'>,
  id: string,
  errorMessage: string
) => {
  await db.notificationOutbox.update({
    where: { id },
    data: {
      status: NotificationOutboxStatus.FAILED,
      error_message: errorMessage,
    },
  });
};

export const getRoleRecipients = async (tx: TxClient, scope: RoleScope) => {
  const deptId = scope.dept_id ?? OPS_DEPT_ID;
  const directRoles = await tx.userOrganizationRole.findMany({
    where: {
      role: scope.role,
      dept_id: deptId,
      unit_id: scope.unit_id ?? null,
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          full_name: true,
        },
      },
    },
  });

  const delegatedUsers = await tx.userDelegation.findMany({
    where: {
      role: scope.role,
      unit_id: scope.unit_id ?? null,
      is_active: true,
      OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
    },
    select: {
      delegatee: {
        select: {
          id: true,
          email: true,
          full_name: true,
        },
      },
    },
  });

  const merged = new Map<
    string,
    { id: string; email: string | null; full_name: string }
  >();

  directRoles?.forEach(({ user }) => merged.set(user.id, user));
  delegatedUsers?.forEach(({ delegatee }) =>
    merged.set(delegatee.id, delegatee)
  );

  return Array.from(merged.values());
};

export const getProjectContext = async (tx: TxClient, projectId: string) => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      responsible_unit_id: true,
      created_by: true,
      assignee_procurement: {
        select: { id: true, full_name: true, email: true },
      },
      assignee_contract: {
        select: { id: true, full_name: true, email: true },
      },
      creator: {
        select: { id: true, full_name: true, email: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return project;
};

export const queueEmailDelivery = async (
  tx: TxClient,
  draft: EmailDeliveryDraft
) => {
  if (draft.dedupeKey) {
    const existing = await tx.notificationDelivery.findFirst({
      where: {
        user_id: draft.userId,
        channel: draft.channel,
        dedupe_key: draft.dedupeKey,
        status: {
          in: [
            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.SENT,
            NotificationDeliveryStatus.SKIPPED,
          ],
        },
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }
  }

  const result = await notificationEmailTransport.queue(draft);
  if (result.status === NotificationDeliveryStatus.SKIPPED) {
    return null;
  }

  try {
    return await tx.notificationDelivery.create({
      data: {
        notification_id: draft.notificationId ?? null,
        user_id: draft.userId,
        channel: draft.channel,
        subject: draft.subject,
        body: draft.body,
        dedupe_key: draft.dedupeKey ?? null,
        status: result.status,
        error_message: result.errorMessage ?? null,
        sent_at: result.sentAt ?? null,
      },
    });
  } catch (error) {
    if (!draft.dedupeKey || !isUniqueConstraintError(error)) {
      throw error;
    }

    return tx.notificationDelivery.findFirst({
      where: {
        user_id: draft.userId,
        channel: draft.channel,
        dedupe_key: draft.dedupeKey,
      },
    });
  }
};

const upsertInAppNotification = async (
  tx: TxClient,
  userId: string,
  input: NotificationDispatchInput
) => {
  if (!tx.notification) {
    return null;
  }

  const updateExistingNotification = async () => {
    const existing = await tx.notification.findFirst({
      where: {
        user_id: userId,
        dedupe_key: input.dedupe_key,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: { id: true, is_read: true },
    });

    if (!existing) {
      return null;
    }

    const notification = await tx.notification.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        body: input.body,
        priority: input.priority,
        target_path: input.target_path ?? null,
        action_label: input.action_label ?? null,
        requires_action: input.requires_action ?? false,
        metadata: toNullableJsonInput(buildNotificationMetadata(input)),
        read_at: existing.is_read ? undefined : null,
        is_read: existing.is_read ? undefined : false,
      },
    });

    return {
      action: 'updated' as const,
      notification,
    };
  };

  if (input.dedupe_key) {
    const existing = await updateExistingNotification();
    if (existing) {
      return existing;
    }
  }

  let notification: Notification;
  try {
    notification = await tx.notification.create({
      data: {
        user_id: userId,
        actor_id: input.actor_id ?? null,
        project_id: input.project_id ?? null,
        category: input.category,
        priority: input.priority,
        title: input.title,
        body: input.body,
        target_path: input.target_path ?? null,
        action_label: input.action_label ?? null,
        requires_action: input.requires_action ?? false,
        dedupe_key: input.dedupe_key ?? null,
        metadata: toNullableJsonInput(buildNotificationMetadata(input)),
      },
    });
  } catch (error) {
    if (!input.dedupe_key || !isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await updateExistingNotification();
    if (!existing) {
      throw error;
    }

    return existing;
  }

  return {
    action: 'created' as const,
    notification,
  };
};

export const dispatchNotification = async (
  tx: TxClient,
  input: NotificationDispatchInput
): Promise<PersistedNotificationResult[]> => {
  const recipientIds = Array.from(new Set(input.recipient_ids)).filter(Boolean);
  if (recipientIds.length === 0) {
    return [];
  }

  const recipients =
    (await tx.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true },
    })) ?? [];

  const persisted = await Promise.all(
    (recipients ?? []).map(async (recipient) => {
      const result = await upsertInAppNotification(tx, recipient.id, input);
      if (!result) return null;

      return {
        userId: recipient.id,
        action: result.action,
        notification: result.notification,
        unreadCount: 0,
      } satisfies PersistedNotificationResult;
    })
  );

  const finalResults = persisted.filter(
    (item): item is PersistedNotificationResult => Boolean(item)
  );

  if (finalResults.length === 0) {
    return [];
  }

  const unreadCounts = await tx.notification.groupBy({
    by: ['user_id'],
    where: {
      user_id: {
        in: finalResults.map((item) => item.userId),
      },
      is_read: false,
    },
    _count: {
      _all: true,
    },
  });

  const unreadCountByUserId = new Map(
    unreadCounts.map((item) => [item.user_id, item._count._all])
  );

  for (const item of finalResults) {
    item.unreadCount = unreadCountByUserId.get(item.userId) ?? 0;
    await queueNotificationOutboxEvent(tx, item);
  }

  return finalResults;
};

export const publishPersistedNotifications = async (
  persistedNotifications: PersistedNotificationResult[]
) => {
  if (persistedNotifications.length === 0) {
    return;
  }

  await publishPendingNotificationOutbox({
    notificationIds: persistedNotifications.map((item) => item.notification.id),
  });
};

export const publishPendingNotificationOutbox = async (options?: {
  notificationIds?: string[];
  limit?: number;
}) => {
  const rows = await loadNotificationOutboxRows(prisma, options);

  for (const row of rows) {
    const claimed = await claimNotificationOutboxRow(prisma, row.id);
    if (!claimed) {
      continue;
    }

    try {
      await publishNotificationRealtimeEvent(row.user_id, {
        type: row.event_type,
        notification: row.payload as NotificationListItemResponse,
        unread_count: row.unread_count,
      });
      await markNotificationOutboxPublished(prisma, row.id);
    } catch (error) {
      await markNotificationOutboxFailed(prisma, row.id, toErrorMessage(error));
    }
  }
};

export const wholeDayDiff = (targetDate: Date, now: Date) => {
  const nowParts = toBangkokParts(now);
  const targetParts = toBangkokParts(targetDate);
  const start = Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day
  );
  const target = Date.UTC(
    targetParts.year,
    targetParts.month - 1,
    targetParts.day
  );
  return Math.round((target - start) / (24 * 60 * 60 * 1000));
};

export { prisma, NotificationChannel };
export type { PersistedNotificationResult };
