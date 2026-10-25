import { SubmissionStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, txMock } from '../../test/prisma-mock';
import { syncProjectPhases } from '../../utils/phase-status';
import {
  notifySubmissionRejected,
  publishPersistedNotifications,
} from '../notification/notification.service';
import {
  NEXUS_SYSTEM_SUPER_ADMIN_ID,
  rejectCompletedSubmissionForEmailFailure,
} from '../submission-email-failure.service';

vi.mock('../../utils/phase-status', () => ({
  syncProjectPhases: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../notification/notification.service', () => ({
  notifySubmissionRejected: vi
    .fn()
    .mockResolvedValue([{ id: 'notification-1' }]),
  publishPersistedNotifications: vi.fn().mockResolvedValue(undefined),
}));

describe('submission-email-failure.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findFirst.mockResolvedValue({
      id: NEXUS_SYSTEM_SUPER_ADMIN_ID,
    });
    txMock.projectSubmission.findUnique.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: 'LT100K',
      step_order: 5,
      submitted_by: 'submitter-1',
      status: SubmissionStatus.COMPLETED,
    });
    txMock.projectSubmission.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects only the completed submission with the system actor and notifies once', async () => {
    const occurredAt = new Date('2026-10-25T12:00:00.000Z');

    await expect(
      rejectCompletedSubmissionForEmailFailure({
        submissionId: 'submission-1',
        reason: 'Mailbox unavailable',
        occurredAt,
      })
    ).resolves.toBe(true);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: NEXUS_SYSTEM_SUPER_ADMIN_ID,
        is_active: true,
        roles: { some: { role: 'SUPER_ADMIN' } },
      },
      select: { id: true },
    });
    expect(txMock.projectSubmission.updateMany).toHaveBeenCalledWith({
      where: { id: 'submission-1', status: SubmissionStatus.COMPLETED },
      data: {
        status: SubmissionStatus.REJECTED,
        comment: 'Mailbox unavailable',
        approved_by: NEXUS_SYSTEM_SUPER_ADMIN_ID,
        approved_at: occurredAt,
        completed_by: null,
        completed_at: null,
      },
    });
    expect(syncProjectPhases).toHaveBeenCalledWith(
      txMock,
      'LT100K',
      'project-1'
    );
    expect(notifySubmissionRejected).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        submission_id: 'submission-1',
        actor_id: NEXUS_SYSTEM_SUPER_ADMIN_ID,
      })
    );
    expect(publishPersistedNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not change or notify an already rejected submission', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      id: 'submission-1',
      status: SubmissionStatus.REJECTED,
    });

    await expect(
      rejectCompletedSubmissionForEmailFailure({
        submissionId: 'submission-1',
        reason: 'Duplicate bounce',
        occurredAt: new Date(),
      })
    ).resolves.toBe(false);

    expect(txMock.projectSubmission.updateMany).not.toHaveBeenCalled();
    expect(notifySubmissionRejected).not.toHaveBeenCalled();
  });

  it('returns a retryable service error when the configured system actor is invalid', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      rejectCompletedSubmissionForEmailFailure({
        submissionId: 'submission-1',
        reason: 'Bounce',
        occurredAt: new Date(),
      })
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
