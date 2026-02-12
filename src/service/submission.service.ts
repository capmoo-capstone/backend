import { Prisma } from '@prisma/client';
import {
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { UserPayload } from '../lib/types';
import {
  ApproveSubmissionDto,
  CreateSubmissionDto,
  RejectSubmissionDto,
} from '../models/Submission';

const getSubmissionRound = async (
  data: CreateSubmissionDto,
  tx: Prisma.TransactionClient
) => {
  const lockKey = `${data.project_id}:${data.step_order ?? 'null'}:${SubmissionType.STAFF}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const lastSubmission = await tx.projectSubmission.findFirst({
    where: {
      project_id: data.project_id,
      step_order: data.step_order,
      submission_type: SubmissionType.STAFF,
    },
    orderBy: { submitted_at: 'desc' },
    select: { submission_round: true },
  });
  return lastSubmission ? (lastSubmission.submission_round || 0) + 1 : 1;
};

export const getProjectSubmissions = async (
  user: UserPayload,
  projectId: string
) => {
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
      documents: true,
    },
  });

  const contractSubmissions = submissionData.filter(
    (submission) => submission.workflow_type === UnitResponsibleType.CONTRACT
  );

  const procurementSubmissions = submissionData.filter(
    (submission) => submission.workflow_type === project?.procurement_type
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
    const project = await tx.project.findUnique({
      where: { id: data.project_id },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const submission_round = await getSubmissionRound(data, tx);
    const nextStatus: SubmissionStatus = data.require_approval
      ? SubmissionStatus.WAITING_APPROVAL
      : SubmissionStatus.COMPLETED;

    return tx.projectSubmission.create({
      data: {
        project_id: data.project_id,
        submitted_by: user.id,
        step_order: data.step_order,
        workflow_type: data.workflow_type,
        submission_round,
        submission_type: SubmissionType.STAFF,
        status: nextStatus,
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
  data: ApproveSubmissionDto
) => {
  const submission = await prisma.projectSubmission.findUnique({
    where: { id: data.id },
    select: { status: true, submitted_by: true },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  if (submission.status !== SubmissionStatus.WAITING_APPROVAL) {
    throw new BadRequestError(
      'Only submissions with WAITING_APPROVAL status can be approved'
    );
  }

  const updated = await prisma.projectSubmission.update({
    where: { id: data.id },
    data: {
      status: data.required_signature
        ? SubmissionStatus.WAITING_PROPOSAL
        : SubmissionStatus.COMPLETED,
      approved_at: new Date(),
      approved_by: user.id,
      completed_at: data.required_signature ? null : new Date(),
      completed_by: data.required_signature ? null : submission.submitted_by,
    },
    select: {
      id: true,
      project_id: true,
      status: true,
    },
  });

  return { data: updated };
};

export const proposeSubmission = async (user: UserPayload, id: string) => {
  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  if (submission.status !== SubmissionStatus.WAITING_PROPOSAL) {
    throw new BadRequestError(
      'Only submissions with WAITING_PROPOSAL status can be signed and completed'
    );
  }

  const updated = await prisma.projectSubmission.update({
    where: { id },
    data: {
      status: SubmissionStatus.WAITING_SIGNATURE,
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

export const signAndCompleteSubmission = async (
  user: UserPayload,
  id: string
) => {
  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    select: { status: true, submitted_by: true },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }
  if (submission.status !== SubmissionStatus.WAITING_SIGNATURE) {
    throw new BadRequestError(
      'Only submissions with WAITING_SIGNATURE status can be completed'
    );
  }

  const updated = await prisma.projectSubmission.update({
    where: { id },
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
