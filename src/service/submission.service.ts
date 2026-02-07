import { Prisma } from '../../generated/prisma/client';
import {
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '../../generated/prisma/enums';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { UserPayload } from '../lib/types';
import {
  StatusSubmissionDto,
  CreateSubmissionDto,
  RejectSubmissionDto,
} from '../models/Submission';

const getSubmissionRound = async (
  data: CreateSubmissionDto,
  tx: Prisma.TransactionClient
) => {
  const lockKey = `${data.project_id}:${data.step_id ?? 'null'}:${SubmissionType.STAFF}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const lastSubmission = await tx.projectSubmission.findFirst({
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

export const getProjectSubmissions = async (user: UserPayload, projectId: string) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { procurement_type: true },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const submissionData = await prisma.projectSubmission.findMany({
    where: { project_id: projectId },
    orderBy: { submitted_at: 'desc' },
    include: {
      step: {
        select: {
          name: true,
          order: true,
          template: { select: { type: true } },
        },
      },
      documents: true,
    },
  });

  const formatSubmissions = submissionData.map((submission) => {
    return {
      step_name: submission.step!.name,
      step_order: submission.step!.order,
      template_type: submission.step!.template.type,
      ...submission,
      step: undefined,
    };
  });

  const contractSubmissions = formatSubmissions.filter(
    (submission) =>
      submission.template_type === UnitResponsibleType.CONTRACT
  );

  const procurementSubmissions = formatSubmissions.filter(
    (submission) => submission.template_type === project?.procurement_type
  );

  return {
    procurement: procurementSubmissions,
    contract: contractSubmissions,
  };
};

export const createStaffSubmissionsProject = async (
  user: UserPayload,
  data: CreateSubmissionDto
) => {
  if (data.type !== SubmissionType.STAFF) {
    throw new BadRequestError('Invalid submission type for staff submission');
  }

  const submission = await prisma.$transaction(async (tx) => {
    const submission_round = await getSubmissionRound(data, tx);

    return tx.projectSubmission.create({
      data: {
        project_id: data.project_id,
        step_id: data.step_id,
        submitted_by: user.id,
        submission_round,
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
      approved_at: new Date(),
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

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  const step = await prisma.workflowStep.findUnique({
    where: { id: data.step_id },
    select: { requires_signature: true },
  });

  if (!step) {
    throw new NotFoundError('Workflow step not found');
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

  return { data: updated };
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
