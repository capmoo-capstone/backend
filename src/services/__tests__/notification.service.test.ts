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
  processDeadlineQueueJob,
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
    prismaMock.notificationOutbox.updateMany.mockResolvedValueOnce({
      count: 1,
    });

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
