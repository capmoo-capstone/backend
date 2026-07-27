import {
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { OPS_DEPT_ID } from '../lib/constant';
import { NotFoundError } from '../lib/errors';
import type { NotificationKind } from '../types/notification.type';
import {
  notificationEmailTransport,
  type EmailDeliveryDraft,
} from './notification-email.service';

export type TxClient = Prisma.TransactionClient;

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

  return tx.notificationDelivery.create({
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
};

const upsertInAppNotification = async (
  tx: TxClient,
  userId: string,
  input: NotificationDispatchInput
) => {
  if (!tx.notification) {
    return null;
  }

  if (input.dedupe_key && tx.notification.findFirst) {
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

    if (existing) {
      return tx.notification.update({
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
    }
  }

  return tx.notification.create({
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
};

export const dispatchNotification = async (
  tx: TxClient,
  input: NotificationDispatchInput
) => {
  const recipientIds = Array.from(new Set(input.recipient_ids)).filter(Boolean);
  if (recipientIds.length === 0) {
    return;
  }

  const recipients =
    (await tx.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true },
    })) ?? [];

  await Promise.all(
    (recipients ?? []).map((recipient) =>
      upsertInAppNotification(tx, recipient.id, input)
    )
  );
};

export const wholeDayDiff = (targetDate: Date, now: Date) => {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const target = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate()
  );
  return Math.round((target - start) / (24 * 60 * 60 * 1000));
};

export { prisma, NotificationChannel };
