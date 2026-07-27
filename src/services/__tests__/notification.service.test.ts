import { NotificationPriority } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { wholeDayDiff } from '../notification/notification-core.service';
import { syncDeadlineNotificationsForUser } from '../notification/notification-query.service';
import { notifyDelegationStarted } from '../notification/notification-trigger.service';
import { prismaMock, txMock } from '../../test/prisma-mock';
import type { AuthPayload } from '../../types/auth.type';

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

  it('uses the Bangkok date in the daily overdue notification key', async () => {
    vi.setSystemTime(new Date('2026-07-12T18:00:00.000Z'));
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-1',
        title: 'Project One',
        expected_approval_date: new Date('2026-07-11T17:00:00.000Z'),
        expected_completion_procurement_date: null,
      },
    ]);
    txMock.user.findMany.mockResolvedValue([{ id: user.id }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({ id: 'notification-1' });

    await syncDeadlineNotificationsForUser(user);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: NotificationPriority.CRITICAL,
          dedupe_key: 'deadline:project-1:approval:overdue:2026-07-13',
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
});
