import { NotificationChannel, NotificationPriority } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  dispatchNotification,
  queueEmailDelivery,
  wholeDayDiff,
} from '../notification/notification-core.service';
import {
  deleteExpiredNotifications,
  listNotifications,
  markNotificationRead,
  processDeadlineDispatchJob,
  processDeadlineQueueJob,
  syncDeadlineNotificationsForUser,
} from '../notification/notification-query.service';
import { notificationEmailTransport } from '../notification/notification-email.service';
import { notifyDelegationStarted } from '../notification/notification-trigger.service';
import { prismaMock, txMock } from '../../test/prisma-mock';
import type { AuthPayload } from '../../types/auth.type';
import * as NotificationRealtimeService from '../notification/notification-realtime.service';

const user: AuthPayload = {
  token: '',
  id: 'user-1',
  username: 'user',
  full_name: 'User One',
  roles: [],
  is_delegated: false,
  delegated_by: [],
};

describe('notification date handling', () => {
  it('compares deadlines by Bangkok calendar day after 07:00 ICT', () => {
    const deadline = new Date('2026-07-11T17:00:00.000Z');
    const noonInBangkok = new Date('2026-07-12T05:00:00.000Z');

    expect(wholeDayDiff(deadline, noonInBangkok)).toBe(0);
  });

  it('calculates a deadline two Bangkok days away across the UTC boundary', () => {
    const deadline = new Date('2026-07-13T17:00:00.000Z');
    const noonInBangkok = new Date('2026-07-12T05:00:00.000Z');

    expect(wholeDayDiff(deadline, noonInBangkok)).toBe(2);
  });

  it('uses the Bangkok date for the due-day overdue notification key', async () => {
    vi.setSystemTime(new Date('2026-07-11T18:00:00.000Z'));
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-1',
        title: 'Project One',
        expected_approval_date: new Date('2026-07-11T17:00:00.000Z'),
        expected_completion_procurement_date: null,
        created_by: user.id,
        assignee_procurement: [],
        assignee_contract: [],
      },
    ]);
    prismaMock.notificationReminder.upsert.mockResolvedValue({
      id: 'reminder-1',
      sent_at: null,
      notification_id: null,
      error_message: null,
    });
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({ id: 'notification-1' });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: user.id, _count: { _all: 1 } },
    ]);
    prismaMock.notificationOutbox.findMany.mockResolvedValue([]);

    await syncDeadlineNotificationsForUser(user);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: NotificationPriority.CRITICAL,
          dedupe_key: 'deadline:project-1:approval:overdue:2026-07-12',
        }),
      })
    );
  });

  it('emits the 24-hour reminder window without also backfilling 7d or 3d', async () => {
    vi.setSystemTime(new Date('2026-07-12T00:00:00.000Z'));
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-24h',
        title: 'Project Twenty Four',
        expected_approval_date: new Date('2026-07-12T12:00:00.000Z'),
        expected_completion_procurement_date: null,
        created_by: user.id,
        assignee_procurement: [],
        assignee_contract: [],
      },
    ]);
    prismaMock.notificationReminder.upsert.mockResolvedValue({
      id: 'reminder-24h',
      sent_at: null,
      notification_id: null,
      error_message: null,
    });
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({ id: 'notification-24h' });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: user.id, _count: { _all: 1 } },
    ]);
    prismaMock.notificationOutbox.findMany.mockResolvedValue([]);

    await syncDeadlineNotificationsForUser(user);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: NotificationPriority.HIGH,
          dedupe_key:
            'deadline:project-24h:approval:24h:2026-07-11T12:00:00.000Z',
        }),
      })
    );
  });

  it('emits the 3-day reminder window when the deadline is within three days', async () => {
    vi.setSystemTime(new Date('2026-07-12T00:00:00.000Z'));
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-3d',
        title: 'Project Three Days',
        expected_approval_date: new Date('2026-07-14T12:00:00.000Z'),
        expected_completion_procurement_date: null,
        created_by: user.id,
        assignee_procurement: [],
        assignee_contract: [],
      },
    ]);
    prismaMock.notificationReminder.upsert.mockResolvedValue({
      id: 'reminder-3d',
      sent_at: null,
      notification_id: null,
      error_message: null,
    });
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({ id: 'notification-3d' });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: user.id, _count: { _all: 1 } },
    ]);
    prismaMock.notificationOutbox.findMany.mockResolvedValue([]);

    await syncDeadlineNotificationsForUser(user);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: NotificationPriority.HIGH,
          dedupe_key:
            'deadline:project-3d:approval:3d:2026-07-11T12:00:00.000Z',
        }),
      })
    );
  });

  it('does not emit overdue reminders on non-weekly overdue days', async () => {
    vi.setSystemTime(new Date('2026-07-15T18:00:00.000Z'));
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-overdue-gap',
        title: 'Project Overdue Gap',
        expected_approval_date: new Date('2026-07-11T17:00:00.000Z'),
        expected_completion_procurement_date: null,
        created_by: user.id,
        assignee_procurement: [],
        assignee_contract: [],
      },
    ]);

    await syncDeadlineNotificationsForUser(user);

    expect(prismaMock.notificationReminder.upsert).not.toHaveBeenCalled();
    expect(txMock.notification.create).not.toHaveBeenCalled();
  });

  it('emits overdue reminders once every seven Bangkok days after the due day', async () => {
    vi.setSystemTime(new Date('2026-07-18T18:00:00.000Z'));
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-overdue-weekly',
        title: 'Project Overdue Weekly',
        expected_approval_date: new Date('2026-07-11T17:00:00.000Z'),
        expected_completion_procurement_date: null,
        created_by: user.id,
        assignee_procurement: [],
        assignee_contract: [],
      },
    ]);
    prismaMock.notificationReminder.upsert.mockResolvedValue({
      id: 'reminder-overdue-weekly',
      sent_at: null,
      notification_id: null,
      error_message: null,
    });
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({
      id: 'notification-overdue-weekly',
    });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: user.id, _count: { _all: 1 } },
    ]);
    prismaMock.notificationOutbox.findMany.mockResolvedValue([]);

    await syncDeadlineNotificationsForUser(user);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: NotificationPriority.CRITICAL,
          dedupe_key:
            'deadline:project-overdue-weekly:approval:overdue:2026-07-19',
        }),
      })
    );
  });

  it('formats delegation dates in Bangkok time without reconstructing Date values', async () => {
    txMock.user.findMany.mockResolvedValue([
      { id: 'delegator-1' },
      { id: 'delegatee-1' },
    ]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({ id: 'notification-1' });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: 'delegator-1', _count: { _all: 1 } },
      { user_id: 'delegatee-1', _count: { _all: 1 } },
    ]);

    await notifyDelegationStarted(txMock, {
      delegator_id: 'delegator-1',
      delegatee_id: 'delegatee-1',
      actor_id: 'actor-1',
      role_label: 'Head of Unit',
      start_date: new Date('2026-07-11T17:00:00.000Z'),
      end_date: new Date('2026-07-12T17:00:00.000Z'),
    });

    const data = txMock.notification.create.mock.calls[0][0].data;
    expect(data.body).toContain('2026-07-12');
    expect(data.body).toContain('2026-07-13');
    expect(data.dedupe_key).toBe(
      'delegation-start:delegator-1:delegatee-1:Head of Unit:2026-07-12'
    );
  });

  it('updates an existing notification when a dedupe conflict occurs on create', async () => {
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'notification-1', is_read: false });
    txMock.notification.create.mockRejectedValueOnce({ code: 'P2002' });
    txMock.notification.update.mockResolvedValueOnce({
      id: 'notification-1',
      user_id: user.id,
      category: 'ASSIGNMENTS',
      priority: NotificationPriority.HIGH,
      title: 'Updated title',
      body: 'Updated body',
      target_path: '/app/projects/project-1',
      action_label: 'Open',
      requires_action: true,
      is_read: false,
      read_at: null,
      created_at: new Date('2026-07-12T00:00:00.000Z'),
      updated_at: new Date('2026-07-12T00:00:00.000Z'),
      dedupe_key: 'assignment:project-1:user-1',
      metadata: { notification_kind: 'ASSIGNED_PROJECTS' },
      actor_id: null,
      project_id: 'project-1',
    } as any);
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: user.id, _count: { _all: 1 } },
    ]);

    const result = await dispatchNotification(txMock, {
      recipient_ids: [user.id],
      project_id: 'project-1',
      kind: 'ASSIGNED_PROJECTS',
      category: 'ASSIGNMENTS' as any,
      priority: NotificationPriority.HIGH,
      title: 'Updated title',
      body: 'Updated body',
      target_path: '/app/projects/project-1',
      action_label: 'Open',
      requires_action: true,
      dedupe_key: 'assignment:project-1:user-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.action).toBe('updated');
    expect(txMock.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notification-1' },
        data: expect.objectContaining({
          title: 'Updated title',
          body: 'Updated body',
        }),
      })
    );
  });

  it('returns the existing delivery row when a delivery dedupe conflict occurs', async () => {
    vi.spyOn(notificationEmailTransport, 'queue').mockResolvedValueOnce({
      status: 'PENDING' as any,
      sentAt: null,
      errorMessage: null,
    });
    txMock.notificationDelivery.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'delivery-1',
        user_id: user.id,
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        dedupe_key: 'email:project-1:user-1',
      });
    txMock.notificationDelivery.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await queueEmailDelivery(txMock, {
      userId: user.id,
      channel: NotificationChannel.EMAIL_IMMEDIATE,
      subject: 'Subject',
      body: 'Body',
      dedupeKey: 'email:project-1:user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'delivery-1',
      })
    );
    expect(txMock.notificationDelivery.create).toHaveBeenCalledOnce();
  });

  it('publishes realtime events only after deadline notification persistence succeeds', async () => {
    const publishSpy = vi
      .spyOn(NotificationRealtimeService, 'publishNotificationRealtimeEvent')
      .mockResolvedValue(undefined);
    prismaMock.notificationOutbox.findMany.mockResolvedValueOnce([
      {
        id: 'outbox-1',
        notification_id: 'notification-1',
        user_id: user.id,
        event_type: 'notification.created',
        payload: {
          id: 'notification-1',
          kind: 'DUE_SOON',
          category: 'DEADLINES',
          priority: 'HIGH',
          title: 'Deadline',
          body: 'Due soon',
          target_path: '/app/projects/project-1',
          action_label: 'Open',
          requires_action: true,
          is_read: false,
          read_at: null,
          created_at: new Date('2026-07-12T00:00:00.000Z'),
          metadata: { notification_kind: 'DUE_SOON' },
        },
        unread_count: 1,
      },
    ] as any);
    prismaMock.notificationOutbox.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notificationReminder.update.mockResolvedValueOnce(undefined);
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({
      id: 'notification-1',
      user_id: user.id,
      category: 'DEADLINES',
      priority: NotificationPriority.HIGH,
      title: 'Deadline',
      body: 'Due soon',
      target_path: '/app/projects/project-1',
      action_label: 'Open',
      requires_action: true,
      is_read: false,
      read_at: null,
      created_at: new Date('2026-07-12T00:00:00.000Z'),
      updated_at: new Date('2026-07-12T00:00:00.000Z'),
      dedupe_key: 'deadline:project-1:approval:24h:2026-07-11T12:00:00.000Z',
      metadata: { notification_kind: 'DUE_SOON' },
      actor_id: null,
      project_id: 'project-1',
    } as any);
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: user.id, _count: { _all: 1 } },
    ]);

    await processDeadlineDispatchJob({
      kind: 'dispatch',
      reminderId: 'reminder-1',
      userId: user.id,
      projectId: 'project-1',
      targetKey: 'approval',
      targetDateIso: '2026-07-12T12:00:00.000Z',
      windowKey: '24h',
      scheduledForIso: '2026-07-11T12:00:00.000Z',
      title: 'Deadline',
      body: 'Due soon',
      priority: 'HIGH',
      dedupeKey: 'deadline:project-1:approval:24h:2026-07-11T12:00:00.000Z',
      targetPath: '/app/projects/project-1',
      metadata: { reminder_window: '24h' },
    });

    expect(publishSpy).toHaveBeenCalledOnce();
    expect(txMock.notificationOutbox.create).toHaveBeenCalled();
    expect(prismaMock.notificationOutbox.updateMany).toHaveBeenCalled();
  });

  it('publishes a realtime update when a notification is marked as read', async () => {
    const publishSpy = vi
      .spyOn(NotificationRealtimeService, 'publishNotificationRealtimeEvent')
      .mockResolvedValue(undefined);
    txMock.notification.findFirst.mockResolvedValue({ id: 'notification-1' });
    txMock.notification.update.mockResolvedValue({
      id: 'notification-1',
      user_id: user.id,
      category: 'ASSIGNMENTS',
      priority: NotificationPriority.HIGH,
      title: 'Assigned',
      body: 'Assigned body',
      target_path: '/app/projects/project-1',
      action_label: 'Open',
      requires_action: true,
      is_read: true,
      read_at: new Date('2026-07-12T01:00:00.000Z'),
      created_at: new Date('2026-07-12T00:00:00.000Z'),
      updated_at: new Date('2026-07-12T01:00:00.000Z'),
      dedupe_key: 'assignment:project-1:user-1',
      metadata: { notification_kind: 'ASSIGNED_PROJECTS' },
      actor_id: null,
      project_id: 'project-1',
    } as any);
    txMock.notification.count.mockResolvedValue(0);
    prismaMock.notificationOutbox.findMany.mockResolvedValueOnce([
      {
        id: 'outbox-2',
        notification_id: 'notification-1',
        user_id: user.id,
        event_type: 'notification.updated',
        payload: {
          id: 'notification-1',
          kind: 'ASSIGNED_PROJECTS',
          category: 'ASSIGNMENTS',
          priority: 'HIGH',
          title: 'Assigned',
          body: 'Assigned body',
          target_path: '/app/projects/project-1',
          action_label: 'Open',
          requires_action: true,
          is_read: true,
          read_at: new Date('2026-07-12T01:00:00.000Z'),
          created_at: new Date('2026-07-12T00:00:00.000Z'),
          metadata: { notification_kind: 'ASSIGNED_PROJECTS' },
        },
        unread_count: 0,
      },
    ] as any);
    prismaMock.notificationOutbox.updateMany.mockResolvedValueOnce({ count: 1 });

    await markNotificationRead(user, 'notification-1');

    expect(publishSpy).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        type: 'notification.updated',
        unread_count: 0,
      })
    );
  });

  it('deletes notifications older than 30 days', async () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    prismaMock.notification.deleteMany.mockResolvedValueOnce({ count: 4 });

    const result = await deleteExpiredNotifications(now);

    expect(result).toEqual({ count: 4 });
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        created_at: {
          lt: new Date('2026-07-17T12:00:00.000Z'),
        },
      },
    });
  });

  it('does not delete notifications exactly at the 30-day cutoff', async () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    prismaMock.notification.deleteMany.mockResolvedValueOnce({ count: 0 });

    await deleteExpiredNotifications(now);

    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        created_at: {
          lt: new Date('2026-07-17T12:00:00.000Z'),
        },
      },
    });
  });

  it('routes cleanup worker jobs to notification retention deletion', async () => {
    prismaMock.notification.deleteMany.mockResolvedValueOnce({ count: 2 });

    await processDeadlineQueueJob({ kind: 'cleanup' });

    expect(prismaMock.notification.deleteMany).toHaveBeenCalledOnce();
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
    expect(prismaMock.notificationOutbox.findMany).not.toHaveBeenCalled();
  });

  it('uses stable created_at and id ordering for notification pagination', async () => {
    prismaMock.notification.findFirst.mockResolvedValueOnce({
      id: 'cursor-id',
      created_at: new Date('2026-07-12T01:00:00.000Z'),
    });
    prismaMock.notification.findMany.mockResolvedValueOnce([]);
    prismaMock.notification.count.mockResolvedValueOnce(0);

    await listNotifications(user, {
      limit: 20,
      cursor: 'cursor-id',
    });

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      })
    );
  });
});
