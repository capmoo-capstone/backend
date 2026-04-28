import { Prisma } from '@prisma/client';
import {
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { AuthPayload } from '../types/auth.type';
import {
  ApproveSubmissionDto,
  CreateStaffSubmissionDto,
  CreateVendorSubmissionDto,
  RejectSubmissionDto,
  VendorSubmissionFilterQuery,
} from '../schemas/submission.schema';
import { syncProjectPhases } from '../lib/phase-status';
import {
  ApprovedSubmissionResponse,
  CompletedSubmissionResponse,
  GetSubmissionRoundDto,
  ProjectSubmissionsResponse,
  ProposedSubmissionResponse,
  RejectedSubmissionResponse,
  SubmissionActionResponse,
  VendorSubmissionsResponse,
} from '../types/submission.type';

const getSubmissionRound = async (
  tx: Prisma.TransactionClient,
  data: GetSubmissionRoundDto
) => {
  const lockKey = `:${data.step_order ?? 'null'}:${data.type}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const lastSubmission = await tx.projectSubmission.count({
    where: {
      project_id: data.project_id,
      step_order: data.step_order,
      workflow_type: data.workflow_type,
      submission_type: data.type,
    },
  });
  return lastSubmission + 1;
};

export const getProjectSubmissions = async (
  user: AuthPayload,
  projectId: string
): Promise<ProjectSubmissionsResponse> => {
  const project = await prisma.project
    .findUniqueOrThrow({
      where: { id: projectId },
      select: { procurement_type: true },
    })
    .catch(() => {
      throw new NotFoundError('Project not found');
    });

  const submissionData = await prisma.projectSubmission.findMany({
    where: { project_id: projectId },
    orderBy: { submitted_at: 'desc' },
    include: {
      documents: true,
      submitter: { select: { full_name: true } },
      approver: { select: { full_name: true } },
      proposer: { select: { full_name: true } },
      completer: { select: { full_name: true } },
    },
  });

  const formattedSubmissions = submissionData.map((submission) => ({
    ...submission,
    submitted_by: submission.submitter?.full_name ?? null,
    approved_by: submission.approver?.full_name ?? null,
    proposing_by: submission.proposer?.full_name ?? null,
    completed_by: submission.completer?.full_name ?? null,
    submitter: undefined,
    approver: undefined,
    proposer: undefined,
    completer: undefined,
  }));

  const contractSubmissions = formattedSubmissions.filter(
    (submission) => submission.workflow_type === UnitResponsibleType.CONTRACT
  );

  const procurementSubmissions = formattedSubmissions.filter(
    (submission) =>
      submission.workflow_type ===
      (project?.procurement_type as UnitResponsibleType)
  );

  return {
    procurement: procurementSubmissions,
    contract: contractSubmissions,
  };
};

export const getVendorSubmissions = async (
  user: AuthPayload,
  page: number,
  limit: number,
  filter: VendorSubmissionFilterQuery
): Promise<VendorSubmissionsResponse> => {
  const and: Prisma.ProjectSubmissionWhereInput[] = [
    { submission_type: SubmissionType.VENDOR },
    { workflow_type: UnitResponsibleType.CONTRACT },
  ];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        {
          project: {
            OR: [
              {
                po_no: {
                  contains: term,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                vendor_name: {
                  contains: term,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                receive_no: {
                  contains: term,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          },
        },
      ],
    });
  }

  if (filter?.dateFrom || filter?.dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filter.dateFrom) {
      const from = new Date(filter.dateFrom);
      from.setHours(0, 0, 0, 0);
      dateFilter.gte = from;
    }
    if (filter.dateTo) {
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    and.push({ submitted_at: dateFilter });
  }

  const where: Prisma.ProjectSubmissionWhereInput = { AND: and };
  const skip = (page - 1) * limit;

  const [submissions, total] = await prisma.$transaction([
    prisma.projectSubmission.findMany({
      where,
      orderBy: { submitted_at: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        po_no: true,
        submitted_at: true,
        status: true,
        documents: {
          select: { field_key: true, file_name: true, file_path: true },
        },
        project: {
          select: {
            id: true,
            receive_no: true,
            title: true,
            vendor_name: true,
            requesting_dept: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.projectSubmission.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: submissions.map((s) => ({
      id: s.id,
      po_no: s.po_no,
      submitted_at: s.submitted_at,
      status: s.status,
      documents: s.documents,
      project_id: s.project.id,
      receive_no: s.project.receive_no,
      title: s.project.title,
      vendor_name: s.project.vendor_name,
      requester: {
        dept_id: s.project.requesting_dept.id,
        dept_name: s.project.requesting_dept.name,
      },
    })),
  };
};

export const createStaffSubmissionsProject = async (
  user: AuthPayload,
  data: CreateStaffSubmissionDto
): Promise<SubmissionActionResponse> => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.project_id },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const submission_round = await getSubmissionRound(tx, {
      project_id: data.project_id,
      type: data.type,
      step_order: data.step_order,
      workflow_type: data.workflow_type,
    });
    const nextStatus: SubmissionStatus = data.require_approval
      ? SubmissionStatus.WAITING_APPROVAL
      : SubmissionStatus.COMPLETED;

    const submission = await tx.projectSubmission.create({
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
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        status: true,
      },
    });
    await syncProjectPhases(
      tx,
      submission.workflow_type,
      submission.project_id
    );
    return submission;
  });
};

export const createVendorSubmissionsProject = async (
  user: AuthPayload,
  data: CreateVendorSubmissionDto
): Promise<SubmissionActionResponse> => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project
      .findFirstOrThrow({
        where: { po_no: data.po_no },
        select: { id: true },
      })
      .catch(() => {
        throw new NotFoundError('Project not found');
      });

    const submission_round = await getSubmissionRound(tx, {
      project_id: project.id,
      type: data.type,
      step_order: data.step_order,
      workflow_type: data.workflow_type,
    });

    const submission = await tx.projectSubmission.create({
      data: {
        project_id: project.id,
        submitted_by: user.id,
        step_order: data.step_order,
        workflow_type: data.workflow_type,
        submission_round,
        submission_type: SubmissionType.VENDOR,
        status: SubmissionStatus.COMPLETED,
        meta_data: [
          { installment: data.installment ?? '-' },
          { po_no: data.po_no },
        ],
        documents: {
          create: data.files?.map((file) => ({
            field_key: file.field_key,
            file_name: file.file_name,
            file_path: file.file_path,
          })),
        },
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        status: true,
      },
    });
    await syncProjectPhases(
      tx,
      submission.workflow_type,
      submission.project_id
    );
    return submission;
  });
};

export const rejectSubmission = async (
  user: AuthPayload,
  data: RejectSubmissionDto
): Promise<RejectedSubmissionResponse> => {
  return await prisma.$transaction(async (tx) => {
    const updated = await tx.projectSubmission.update({
      where: { id: data.id },
      data: {
        status: SubmissionStatus.REJECTED,
        comment: data.comment,
        approved_by: user.id,
        approved_at: new Date(),
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        status: true,
        comment: true,
        approved_by: true,
        approved_at: true,
      },
    });
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    return updated;
  });
};

export const approveSubmission = async (
  user: AuthPayload,
  data: ApproveSubmissionDto
): Promise<ApprovedSubmissionResponse> => {
  return await prisma.$transaction(async (tx) => {
    const submission = await tx.projectSubmission.findUnique({
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

    const updated = await tx.projectSubmission.update({
      where: { id: data.id },
      data: {
        status: data.required_signature
          ? SubmissionStatus.WAITING_PROPOSAL
          : SubmissionStatus.COMPLETED,
        approved_at: new Date(),
        approved_by: user.id,
        completed_at: data.required_signature ? null : new Date(),
        completed_by: data.required_signature ? null : user.id,
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        status: true,
        approved_at: data.required_signature ? true : false,
        approved_by: data.required_signature ? true : false,
        completed_at: data.required_signature ? false : true,
        completed_by: data.required_signature ? false : true,
      },
    });
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    return updated;
  });
};

export const proposeSubmission = async (
  user: AuthPayload,
  id: string
): Promise<ProposedSubmissionResponse> => {
  return await prisma.$transaction(async (tx) => {
    const submission = await tx.projectSubmission.findUnique({
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

    const updated = await tx.projectSubmission.update({
      where: { id },
      data: {
        status: SubmissionStatus.WAITING_SIGNATURE,
        proposing_at: new Date(),
        proposing_by: user.id,
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        status: true,
        proposing_at: true,
        proposing_by: true,
      },
    });
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    return updated;
  });
};

export const signAndCompleteSubmission = async (
  user: AuthPayload,
  id: string
): Promise<CompletedSubmissionResponse> => {
  return await prisma.$transaction(async (tx) => {
    const submission = await tx.projectSubmission.findUnique({
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

    const updated = await tx.projectSubmission.update({
      where: { id },
      data: {
        status: SubmissionStatus.COMPLETED,
        completed_at: new Date(),
        completed_by: user.id,
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        status: true,
        completed_at: true,
        completed_by: true,
      },
    });
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    return updated;
  });
};
