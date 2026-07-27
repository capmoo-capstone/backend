import {
  NotificationCategory,
  NotificationPriority,
  Prisma,
  ProjectStatus,
} from '@prisma/client';
import {
  dispatchNotification,
  prisma,
  wholeDayDiff,
} from './notification-core.service';
import { NotFoundError } from '../../lib/errors';
import { ListNotificationsQueryDto } from '../../schemas/notification.schema';
import { AuthPayload } from '../../types/auth.type';
import {
  NotificationListResponse,
  type NotificationKind,
} from '../../types/notification.type';

export const syncDeadlineNotificationsForUser = async (user: AuthPayload) => {
  const today = new Date();
  const projects = await prisma.project.findMany({
    where: {
      status: {
        notIn: [ProjectStatus.CANCELLED, ProjectStatus.CLOSED],
      },
      OR: [
        { created_by: user.id },
        { assignee_procurement: { some: { id: user.id } } },
        { assignee_contract: { some: { id: user.id } } },
      ],
    },
    select: {
      id: true,
      title: true,
      expected_approval_date: true,
      expected_completion_procurement_date: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    for (const project of projects) {
      const targets = [
        {
          label: 'กำหนดอนุมัติ',
          date: project.expected_approval_date,
          key: 'approval',
        },
        {
          label: 'กำหนดส่งต่องานจัดซื้อ',
          date: project.expected_completion_procurement_date,
          key: 'completion',
        },
      ];

      for (const target of targets) {
        if (!target.date) continue;
        const diff = wholeDayDiff(target.date, today);

        if (![7, 2].includes(diff) && diff >= 0) continue;

        const severity =
          diff < 0
            ? NotificationPriority.CRITICAL
            : diff <= 2
              ? NotificationPriority.HIGH
              : NotificationPriority.MEDIUM;
        const body =
          diff < 0
            ? `${target.label} ของโครงการ "${project.title}" เลยกำหนดแล้ว กรุณาตรวจสอบทันที`
            : `${target.label} ของโครงการ "${project.title}" จะครบกำหนดในอีก ${diff} วัน`;

        await dispatchNotification(tx, {
          recipient_ids: [user.id],
          project_id: project.id,
          actor_id: null,
          kind: 'DUE_SOON',
          category: NotificationCategory.DEADLINES,
          priority: severity,
          title: diff < 0 ? 'งานเลยกำหนด' : 'ใกล้ครบกำหนด',
          body,
          target_path: `/app/projects/${project.id}`,
          action_label: 'เปิดโครงการ',
          requires_action: true,
          dedupe_key:
            diff < 0
              ? `deadline:${project.id}:${target.key}:overdue:${today.toISOString().slice(0, 10)}`
              : `deadline:${project.id}:${target.key}:${diff}`,
          metadata: {
            target_date: target.date.toISOString(),
            days_remaining: diff,
          },
        });
      }
    }
  });
};

export const syncDeadlineNotificationsForAllUsers = async () => {
  const projects = await prisma.project.findMany({
    where: {
      status: {
        notIn: [ProjectStatus.CANCELLED, ProjectStatus.CLOSED],
      },
      OR: [
        { expected_approval_date: { not: null } },
        { expected_completion_procurement_date: { not: null } },
      ],
    },
    select: {
      created_by: true,
      assignee_procurement: { select: { id: true } },
      assignee_contract: { select: { id: true } },
    },
  });

  const userIds = Array.from(
    new Set(
      projects.flatMap((project) => [
        project.created_by,
        ...project.assignee_procurement.map((user) => user.id),
        ...project.assignee_contract.map((user) => user.id),
      ])
    )
  );

  const BATCH_SIZE = 10;
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((userId) =>
        syncDeadlineNotificationsForUser({
          token: '',
          id: userId,
          username: '',
          full_name: '',
          roles: [],
          is_delegated: false,
          delegated_by: [],
        })
      )
    );
  }
};

const getNotificationKind = (item: {
  category: NotificationCategory;
  requires_action: boolean;
  metadata: unknown;
}): NotificationKind => {
  if (item.metadata && typeof item.metadata === 'object') {
    const metadataKind = (item.metadata as Record<string, unknown>)
      .notification_kind;
    if (typeof metadataKind === 'string') {
      return metadataKind as NotificationKind;
    }
  }

  switch (item.category) {
    case NotificationCategory.DEADLINES:
      return 'DUE_SOON';
    case NotificationCategory.CANCELLATIONS:
      return item.requires_action ? 'CANCEL_REQUESTED' : 'CANCEL_APPROVED';
    case NotificationCategory.APPROVALS:
      return item.requires_action ? 'WAITING_APPROVE' : 'APPROVED_STEP';
    case NotificationCategory.DELEGATION:
      return 'DELEGATION_STARTED';
    case NotificationCategory.VENDOR_SUBMISSIONS:
      return 'ASSIGNED_DOCUMENT';
    case NotificationCategory.FINANCE_HANDOFFS:
      return 'FINANCE_SUBMIT';
    case NotificationCategory.WORKFLOW_UPDATES:
      return 'APPROVED_STEP';
    case NotificationCategory.ASSIGNMENTS:
    case NotificationCategory.SYSTEM_ACCOUNT:
    default:
      return 'ASSIGNED_PROJECTS';
  }
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

  const items = await prisma.notification.findMany({
    where,
    orderBy: [{ is_read: 'asc' }, { priority: 'asc' }, { created_at: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
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
    items: sliced.map((item) => ({
      id: item.id,
      kind: getNotificationKind(item),
      category: item.category,
      priority: item.priority,
      title: item.title,
      body: item.body,
      target_path: item.target_path,
      action_label: item.action_label,
      requires_action: item.requires_action,
      is_read: item.is_read,
      read_at: item.read_at,
      created_at: item.created_at,
      metadata: item.metadata,
    })),
    unread_count: unreadCount,
    has_more: hasMore,
    next_cursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
  };
};

export const markNotificationRead = async (
  user: AuthPayload,
  notificationId: string
) => {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      user_id: user.id,
    },
    select: { id: true },
  });

  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  return prisma.notification.update({
    where: { id: notification.id },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  });
};

export const markAllNotificationsRead = async (user: AuthPayload) => {
  await prisma.notification.updateMany({
    where: {
      user_id: user.id,
      is_read: false,
    },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  });
};
