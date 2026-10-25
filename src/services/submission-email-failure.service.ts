import { Prisma, SubmissionStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ServiceUnavailableError } from '../utils/errors';
import { syncProjectPhases } from '../utils/phase-status';
import {
  notifySubmissionRejected,
  publishPersistedNotifications,
} from './notification/notification.service';

export const NEXUS_SYSTEM_SUPER_ADMIN_ID =
  '0ac2f1c4-106d-45c0-ba0d-19d80a949dd7';

const getSystemSuperAdmin = async (tx: Prisma.TransactionClient) => {
  const systemUser = await tx.user.findFirst({
    where: {
      id: NEXUS_SYSTEM_SUPER_ADMIN_ID,
      is_active: true,
      roles: { some: { role: UserRole.SUPER_ADMIN } },
    },
    select: { id: true },
  });

  if (!systemUser) {
    throw new ServiceUnavailableError(
      'The Nexus system super-admin account is missing, inactive, or does not have SUPER_ADMIN'
    );
  }

  return systemUser;
};

export type SubmissionEmailFailureInput = {
  submissionId: string;
  reason: string;
  occurredAt: Date;
};

export const rejectCompletedSubmissionForEmailFailureInTransaction = async (
  tx: Prisma.TransactionClient,
  input: SubmissionEmailFailureInput
) => {
  const systemUser = await getSystemSuperAdmin(tx);
  const submission = await tx.projectSubmission.findUnique({
    where: { id: input.submissionId },
    select: {
      id: true,
      project_id: true,
      workflow_type: true,
      step_order: true,
      submitted_by: true,
      status: true,
    },
  });

  if (!submission || submission.status !== SubmissionStatus.COMPLETED) {
    return { changed: false, notificationResults: [] };
  }

  const changed = await tx.projectSubmission.updateMany({
    where: {
      id: submission.id,
      status: SubmissionStatus.COMPLETED,
    },
    data: {
      status: SubmissionStatus.REJECTED,
      comment: input.reason,
      approved_by: systemUser.id,
      approved_at: input.occurredAt,
      completed_by: null,
      completed_at: null,
    },
  });

  if (changed.count === 0) {
    return { changed: false, notificationResults: [] };
  }

  await syncProjectPhases(tx, submission.workflow_type, submission.project_id);
  const notificationResults = await notifySubmissionRejected(tx, {
    project_id: submission.project_id,
    actor_id: systemUser.id,
    submitter_id: submission.submitted_by,
    submission_id: submission.id,
    step_order: submission.step_order,
    reason: input.reason,
  });

  return { changed: true, notificationResults };
};

export const rejectCompletedSubmissionForEmailFailure = async (
  input: SubmissionEmailFailureInput
) => {
  const result = await prisma.$transaction((tx) =>
    rejectCompletedSubmissionForEmailFailureInTransaction(tx, input)
  );

  await publishPersistedNotifications(result.notificationResults);
  return result.changed;
};
