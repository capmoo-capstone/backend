import { randomUUID } from 'crypto';
import {
  NotificationCategory,
  NotificationOutboxStatus,
  NotificationPriority,
  Prisma,
  ProjectStatus,
} from '@prisma/client';
import { runtimeConfig } from '../../config/runtime';
import {
  bangkokTodayStartUtc,
  formatBangkokDate,
  nowUtc,
} from '../../lib/date';
import { NotFoundError } from '../../lib/errors';
import { ListNotificationsQueryDto } from '../../schemas/notification.schema';
import { AuthPayload } from '../../types/auth.type';
import { NotificationListResponse } from '../../types/notification.type';
import {
  dispatchNotification,
  publishPendingNotificationOutbox,
  prisma,
  publishPersistedNotifications,
} from './notification-core.service';
import {
  enqueueDeadlineDispatch,
  enqueueDeadlineScan,
  type NotificationDeadlineJob,
} from './notification-queue.service';
import {
  mapNotificationRecord,
  getNotificationKind,
} from './notification-response.mapper';

type DeadlineTargetKey = 'approval' | 'completion';
type ReminderWindowKey = '7d' | '3d' | '24h' | 'overdue';

type ReminderWindow = {
  key: Exclude<ReminderWindowKey, 'overdue'>;
  offsetMs: number;
  label: string;
  priority: NotificationPriority;
};

type DeadlineTarget = {
  key: DeadlineTargetKey;
  date: Date;
  label: string;
};

type ReminderCandidate = {
  userId: string;
  projectId: string;
  projectTitle: string;
  targetKey: DeadlineTargetKey;
  targetDate: Date;
  targetLabel: string;
  windowKey: ReminderWindowKey;
  scheduledFor: Date;
  title: string;
  body: string;
  priority: NotificationPriority;
  dedupeKey: string;
  metadata: Record<string, unknown>;
};

type ReminderReservation = {
  id: string;
  sent_at: Date | null;
  notification_id: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 30 * DAY_MS;

const REMINDER_WINDOWS: ReminderWindow[] = [
  {
    key: '7d',
    offsetMs: 7 * DAY_MS,
    label: 'อีก 7 วัน',
    priority: NotificationPriority.MEDIUM,
  },
  {
    key: '3d',
    offsetMs: 3 * DAY_MS,
    label: 'อีก 3 วัน',
    priority: NotificationPriority.HIGH,
  },
  {
    key: '24h',
    offsetMs: 24 * HOUR_MS,
    label: 'อีก 24 ชั่วโมง',
    priority: NotificationPriority.HIGH,
  },
  /*
  {
    key: '1h',
    offsetMs: 1 * HOUR_MS,
    label: 'อีก 1 ชั่วโมง',
    priority: NotificationPriority.CRITICAL,
  },
  */
];

const buildReminderBody = (
  projectTitle: string,
  targetLabel: string,
  windowKey: ReminderWindowKey
) => {
  if (windowKey === 'overdue') {
    return `${targetLabel} ของโครงการ "${projectTitle}" เลยกำหนดแล้ว กรุณาตรวจสอบทันที`;
  }

  const labelByWindowKey: Record<
    Exclude<ReminderWindowKey, 'overdue'>,
    string
  > = {
    '7d': 'อีก 7 วัน',
    '3d': 'อีก 3 วัน',
    '24h': 'อีก 24 ชั่วโมง',
  };
  return `${targetLabel} ของโครงการ "${projectTitle}" จะครบกำหนดใน${labelByWindowKey[windowKey] ?? ''}`;
};

const buildReminderTitle = (windowKey: ReminderWindowKey) =>
  windowKey === 'overdue' ? 'งานเลยกำหนด' : 'ใกล้ครบกำหนด';

const buildReminderDedupeKey = (
  projectId: string,
  targetKey: DeadlineTargetKey,
  windowKey: ReminderWindowKey,
  scheduledFor: Date
) => {
  if (windowKey === 'overdue') {
    return `deadline:${projectId}:${targetKey}:overdue:${formatBangkokDate(
      scheduledFor
    )}`;
  }

  return `deadline:${projectId}:${targetKey}:${windowKey}:${scheduledFor.toISOString()}`;
};

const getBangkokDayDiff = (targetDate: Date, now: Date) => {
  const nowStart = bangkokTodayStartUtc(now);
  const targetStart = bangkokTodayStartUtc(targetDate);
  return Math.round((targetStart.getTime() - nowStart.getTime()) / DAY_MS);
};

const buildReminderCandidates = (input: {
  userId: string;
  projectId: string;
  projectTitle: string;
  target: DeadlineTarget;
  now: Date;
}): ReminderCandidate[] => {
  const candidates: ReminderCandidate[] = [];
  const remainingMs = input.target.date.getTime() - input.now.getTime();
  const bangkokDayDiff = getBangkokDayDiff(input.target.date, input.now);

  for (const [index, window] of REMINDER_WINDOWS.entries()) {
    const nextWindow = REMINDER_WINDOWS[index + 1];
    const lowerBoundMs = nextWindow ? nextWindow.offsetMs : 0;
    const scheduledFor = new Date(
      input.target.date.getTime() - window.offsetMs
    );

    if (
      remainingMs > window.offsetMs ||
      remainingMs <= lowerBoundMs ||
      scheduledFor > input.now
    ) {
      continue;
    }

    candidates.push({
      userId: input.userId,
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      targetKey: input.target.key,
      targetDate: input.target.date,
      targetLabel: input.target.label,
      windowKey: window.key,
      scheduledFor,
      title: buildReminderTitle(window.key),
      body: buildReminderBody(
        input.projectTitle,
        input.target.label,
        window.key
      ),
      priority: window.priority,
      dedupeKey: buildReminderDedupeKey(
        input.projectId,
        input.target.key,
        window.key,
        scheduledFor
      ),
      metadata: {
        target_date: input.target.date.toISOString(),
        scheduled_for: scheduledFor.toISOString(),
        reminder_window: window.key,
      },
    });
  }

  if (input.target.date <= input.now && bangkokDayDiff <= 0) {
    const daysOverdue = Math.abs(bangkokDayDiff);
    if (daysOverdue !== 0 && daysOverdue % 7 !== 0) {
      return candidates;
    }

    const overdueScheduledFor = new Date(
      bangkokTodayStartUtc(input.target.date).getTime() + daysOverdue * DAY_MS
    );
    candidates.push({
      userId: input.userId,
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      targetKey: input.target.key,
      targetDate: input.target.date,
      targetLabel: input.target.label,
      windowKey: 'overdue',
      scheduledFor: overdueScheduledFor,
      title: buildReminderTitle('overdue'),
      body: buildReminderBody(
        input.projectTitle,
        input.target.label,
        'overdue'
      ),
      priority: NotificationPriority.CRITICAL,
      dedupeKey: buildReminderDedupeKey(
        input.projectId,
        input.target.key,
        'overdue',
        overdueScheduledFor
      ),
      metadata: {
        target_date: input.target.date.toISOString(),
        scheduled_for: overdueScheduledFor.toISOString(),
        reminder_window: 'overdue',
      },
    });
  }

  return candidates;
};

const reserveReminderCandidate = async (
  candidate: ReminderCandidate
): Promise<ReminderReservation | null> => {
  const reminder = await prisma.notificationReminder.upsert({
    where: {
      user_id_project_id_target_key_window_key_scheduled_for: {
        user_id: candidate.userId,
        project_id: candidate.projectId,
        target_key: candidate.targetKey,
        window_key: candidate.windowKey,
        scheduled_for: candidate.scheduledFor,
      },
    },
    create: {
      id: randomUUID(),
      user_id: candidate.userId,
      project_id: candidate.projectId,
      target_key: candidate.targetKey,
      window_key: candidate.windowKey,
      scheduled_for: candidate.scheduledFor,
      metadata: candidate.metadata as any,
    },
    update: {},
    select: {
      id: true,
      sent_at: true,
      notification_id: true,
      error_message: true,
    },
  });

  if (reminder.sent_at === null && reminder.error_message !== null) {
    await prisma.notificationReminder.update({
      where: { id: reminder.id },
      data: {
        error_message: null,
      },
    });
  }

  return {
    id: reminder.id,
    sent_at: reminder.sent_at,
    notification_id: reminder.notification_id,
  };
};

const markReminderSent = async (
  reminderId: string,
  notificationId?: string | null
) => {
  await prisma.notificationReminder.update({
    where: { id: reminderId },
    data: {
      notification_id: notificationId ?? null,
      sent_at: nowUtc(),
      error_message: null,
    },
  });
};

const markReminderFailed = async (reminderId: string, errorMessage: string) => {
  await prisma.notificationReminder.update({
    where: { id: reminderId },
    data: {
      error_message: errorMessage,
    },
  });
};

const toDispatchJob = (
  reminderId: string,
  candidate: ReminderCandidate
): Extract<NotificationDeadlineJob, { kind: 'dispatch' }> => ({
  kind: 'dispatch',
  reminderId,
  userId: candidate.userId,
  projectId: candidate.projectId,
  targetKey: candidate.targetKey,
  targetDateIso: candidate.targetDate.toISOString(),
  windowKey: candidate.windowKey,
  scheduledForIso: candidate.scheduledFor.toISOString(),
  title: candidate.title,
  body: candidate.body,
  priority: candidate.priority,
  dedupeKey: candidate.dedupeKey,
  targetPath: `/app/projects/${candidate.projectId}`,
  metadata: candidate.metadata,
});

const collectReminderCandidates = async (userIds?: string[]) => {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      status: {
        notIn: [ProjectStatus.CANCELLED, ProjectStatus.CLOSED],
      },
      AND: [
        { expected_approval_date: { not: null } },
        ...(userIds?.length
          ? [
              {
                OR: [
                  { created_by: { in: userIds } },
                  { assignee_procurement: { some: { id: { in: userIds } } } },
                  { assignee_contract: { some: { id: { in: userIds } } } },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      title: true,
      created_by: true,
      expected_approval_date: true,
      assignee_procurement: { select: { id: true } },
      assignee_contract: { select: { id: true } },
    },
  });

  const candidates: ReminderCandidate[] = [];

  for (const project of projects) {
    const recipientIds = Array.from(
      new Set([
        project.created_by,
        ...project.assignee_procurement.map((user) => user.id),
        ...project.assignee_contract.map((user) => user.id),
      ])
    );

    const targets: DeadlineTarget[] = [
      project.expected_approval_date
        ? {
            key: 'approval',
            label: 'กำหนดอนุมัติ',
            date: project.expected_approval_date,
          }
        : null,
    ].filter((item): item is DeadlineTarget => Boolean(item));

    for (const recipientId of recipientIds) {
      for (const target of targets) {
        candidates.push(
          ...buildReminderCandidates({
            userId: recipientId,
            projectId: project.id,
            projectTitle: project.title,
            target,
            now,
          })
        );
      }
    }
  }

  return candidates;
};

export const processDeadlineDispatchJob = async (
  job: Extract<NotificationDeadlineJob, { kind: 'dispatch' }>
) => {
  try {
    const persisted = await prisma.$transaction((tx) =>
      dispatchNotification(tx, {
        recipient_ids: [job.userId],
        project_id: job.projectId,
        actor_id: null,
        kind: 'DUE_SOON',
        category: NotificationCategory.DEADLINES,
        priority: job.priority,
        title: job.title,
        body: job.body,
        target_path: job.targetPath,
        action_label: 'เปิดโครงการ',
        requires_action: true,
        dedupe_key: job.dedupeKey,
        metadata: {
          ...job.metadata,
          target_date: job.targetDateIso,
          target_key: job.targetKey,
          window_key: job.windowKey,
          scheduled_for: job.scheduledForIso,
        },
      })
    );

    await publishPersistedNotifications(persisted);
    await markReminderSent(
      job.reminderId,
      persisted[0]?.notification.id ?? null
    );
  } catch (error) {
    await markReminderFailed(
      job.reminderId,
      error instanceof Error ? error.message : 'Unknown reminder failure'
    );
    throw error;
  }
};

export const processDeadlineReminderScan = async (options?: {
  userIds?: string[];
  queueOnly?: boolean;
}) => {
  const queueOnly = options?.queueOnly ?? false;
  const candidates = await collectReminderCandidates(options?.userIds);

  for (const candidate of candidates) {
    const reservation = await reserveReminderCandidate(candidate);
    if (!reservation || reservation.sent_at) continue;

    const job = toDispatchJob(reservation.id, candidate);
    if (queueOnly) {
      const queued = await enqueueDeadlineDispatch(job).catch(() => null);
      if (!queued) {
        await processDeadlineDispatchJob(job);
      }
      continue;
    }

    await processDeadlineDispatchJob(job);
  }
};

export const syncDeadlineNotificationsForUser = async (user: AuthPayload) => {
  await processDeadlineReminderScan({ userIds: [user.id] });
};

export const syncDeadlineNotificationsForAllUsers = async () => {
  await processDeadlineReminderScan();
};

export const enqueueDeadlineReminderScan = async () => {
  const job = await enqueueDeadlineScan();
  if (!job) {
    await processDeadlineReminderScan();
  }
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
    await processDeadlineReminderScan({ queueOnly: true });
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

  await processDeadlineDispatchJob(job);
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
