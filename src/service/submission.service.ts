import { SubmissionStatus, SubmissionType } from '../../generated/prisma/enums';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { UserPayload } from '../lib/types';
import {
  StatusSubmissionDto,
  CreateSubmissionDto,
  RejectSubmissionDto,
} from '../models/Submission';

const getSubmissionRound = async (data: CreateSubmissionDto) => {
  const lastSubmission = await prisma.projectSubmission.findFirst({
    where: {
      project_id: data.project_id,
      step_id: data.step_id,
      submission_type: SubmissionType.STAFF,
    },
    orderBy: { submitted_at: 'desc' },
    select: { submission_round: true },
  });
  return lastSubmission ? (lastSubmission.submission_round || 0) + 1 : 1;
};

export const createStaffSubmissionsProject = async (
  user: UserPayload,
  data: CreateSubmissionDto
) => {
  if (data.type !== SubmissionType.STAFF) {
    throw new Error('Invalid submission type for staff submission');
  }

  const submission = await prisma.projectSubmission.create({
    data: {
      project_id: data.project_id,
      step_id: data.step_id,
      submitted_by: user.id,
      submission_round: await getSubmissionRound(data),
      submission_type: SubmissionType.STAFF,
      status: SubmissionStatus.SUBMITTED,
      meta_data: data.meta_data,
      documents: {
        create: data.files?.map((file) => ({
          field_key: file.field_key,
          file_name: file.file_name,
          file_path: file.file_path,
        })),
      },
    },
  });

  return submission;
};

export const rejectSubmission = async (
  user: UserPayload,
  data: RejectSubmissionDto
) => {
  const submission = await prisma.projectSubmission.update({
    where: { id: data.id },
    data: {
      status: SubmissionStatus.REJECTED,
      comment: data.comment,
      approved_by: user.id,
    },
    select: { id: true, project_id: true, status: true, comment: true },
  });

  return { data: submission };
};

export const approveSubmission = async (
  user: UserPayload,
  data: StatusSubmissionDto
) => {
  const submission = await prisma.projectSubmission.findUnique({
    where: { id: data.id },
    select: { status: true, submitted_by: true },
  });

  const step = await prisma.workflowStep.findUnique({
    where: { id: data.step_id },
    select: { requires_signature: true },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }
  if (submission.status !== SubmissionStatus.SUBMITTED) {
    throw new BadRequestError(
      'Only submissions with SUBMITTED status can be approved'
    );
  }

  const updated = await prisma.projectSubmission.update({
    where: { id: data.id },
    data: {
      status: step?.requires_signature
        ? SubmissionStatus.PENDING_PROPOSAL
        : SubmissionStatus.COMPLETED,
      approved_at: new Date(),
      approved_by: user.id,
      completed_at: step?.requires_signature ? null : new Date(),
      completed_by: step?.requires_signature ? null : submission.submitted_by,
    },
    select: {
      id: true,
      project_id: true,
      status: true,
    },
  });

  return { updated };
};

export const proposeSubmission = async (
  user: UserPayload,
  data: StatusSubmissionDto
) => {
  const submission = await prisma.projectSubmission.findUnique({
    where: { id: data.id },
    select: { status: true },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  if (submission.status !== SubmissionStatus.PENDING_PROPOSAL) {
    throw new BadRequestError(
      'Only submissions with PENDING_PROPOSAL status can be proposed'
    );
  }

  const updated = await prisma.projectSubmission.update({
    where: { id: data.id },
    data: {
      status: SubmissionStatus.PROPOSING,
      proposing_at: new Date(),
      proposing_by: user.id,
    },
    select: {
      id: true,
      project_id: true,
      status: true,
    },
  });

  return { data: updated };
};

export const finishProposedSubmission = async (
  user: UserPayload,
  data: StatusSubmissionDto
) => {
  const submission = await prisma.projectSubmission.findUnique({
    where: { id: data.id },
    select: { status: true, submitted_by: true },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }
  if (submission.status !== SubmissionStatus.PROPOSING) {
    throw new BadRequestError(
      'Only submissions with PROPOSING status can be completed'
    );
  }

  const updated = await prisma.projectSubmission.update({
    where: { id: data.id },
    data: {
      status: SubmissionStatus.COMPLETED,
      completed_at: new Date(),
      completed_by: user.id,
    },
    select: {
      id: true,
      project_id: true,
      status: true,
    },
  });

  return { data: updated };
};
