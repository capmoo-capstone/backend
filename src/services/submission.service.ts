import {
  Prisma,
  Project,
  ProjectActionType,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { WORKFLOW_STEP_ORDERS } from '../utils/constant';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { syncProjectPhases } from '../utils/phase-status';
import {
  ApproveSubmissionDto,
  CompleteSubmissionDto,
  CreateStaffSubmissionDto,
  CreateVendorSubmissionDto,
  RejectSubmissionDto,
  UpdateProjectForSubmissionSchema,
  VendorSubmissionFilterQuery,
} from '../schemas/submission.schema';
import { AuthPayload } from '../types/auth.type';
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
import { PersistedNotificationResult } from '../types/notification.type';
import { createProjectHistoryAndAuditEvent } from './audit-log.service';
import { checkRefNumberDuplication } from './project-data.service';
import {
  notifyApprovalRequired,
  publishPersistedNotifications,
  notifySubmissionRejected,
  notifySignatureRequired,
  notifyVendorSubmissionReceived,
  notifyWorkflowStepApproved,
} from './notification/notification.service';
import { sendVendorPoRequestEmailForProject } from './notification/notification-email.service';
import { generatePresignedDownloadUrl } from './storage.service';
import { bangkokDayEndUtc, bangkokDayStartUtc, nowUtc } from '../utils/date';
import { assertInstallmentRoundsCanBeUpdated } from '../utils/project-installment';
import { Capability, assertCapability } from '../utils/access-policy';
import { assertCanReadProject, projectReadWhere } from '../utils/project-scope';

const VENDOR_PO_EMAIL_STEP_ORDERS = new Map<UnitResponsibleType, number>([
  [UnitResponsibleType.MT500K, 5],
  [UnitResponsibleType.EBIDDING, 9],
  [UnitResponsibleType.SELECTION, 6],
  [UnitResponsibleType.LT500K, 3],
  [UnitResponsibleType.LT100K, 3],
  [UnitResponsibleType.INTERNAL, 3],
]);

const shouldSendVendorPoEmailForSubmission = (input: {
  workflowType: UnitResponsibleType;
  stepOrder: number;
  status: SubmissionStatus;
}) =>
  input.status === SubmissionStatus.COMPLETED &&
  VENDOR_PO_EMAIL_STEP_ORDERS.get(input.workflowType) === input.stepOrder;

const safeSendVendorPoEmail = async (projectId: string) => {
  try {
    await sendVendorPoRequestEmailForProject(projectId);
  } catch (error) {
    console.error(
      'Vendor PO request email failed:',
      error instanceof Error ? error.message : 'Unknown email error'
    );
  }
};

const getSubmissionRound = async (
  tx: Prisma.TransactionClient,
  data: GetSubmissionRoundDto
) => {
  const installmentKey = data.installment_no ?? 'none';
  const lockKey = `${data.project_id}:${data.workflow_type}:${installmentKey}:${data.step_order}:${data.type}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const lastSubmission = await tx.projectSubmission
    .findFirst({
      where: {
        project_id: data.project_id,
        step_order: data.step_order,
        workflow_type: data.workflow_type,
        installment_no: data.installment_no ?? null,
        submission_type: data.type,
      },
      orderBy: { submission_round: 'desc' },
      select: { submission_round: true },
    })
    .then((s) => s?.submission_round ?? 0);

  return lastSubmission + 1;
};

const validateInstallmentNo = (
  workflowType: UnitResponsibleType,
  installmentNo: number | undefined,
  installmentRounds: number
) => {
  if (workflowType !== UnitResponsibleType.CONTRACT) {
    if (installmentNo !== undefined) {
      throw new BadRequestError(
        'Installment number is only allowed for CONTRACT workflow'
      );
    }
    return null;
  }

  if (installmentNo === undefined) {
    throw new BadRequestError(
      'Installment number is required for CONTRACT workflow'
    );
  }

  if (installmentNo < 1 || installmentNo > installmentRounds) {
    throw new BadRequestError(
      `Installment number must be between 1 and ${installmentRounds}`
    );
  }

  return installmentNo;
};

type ProjectForUpdate = Pick<
  Project,
  | 'id'
  | 'actual_cost'
  | 'pr_no'
  | 'po_no'
  | 'less_no'
  | 'migo_103_no'
  | 'migo_105_no'
  | 'asset_code'
  | 'vendor_name'
  | 'vendor_email'
  | 'contract_no_id'
  | 'installment_rounds'
>;

const updateProjectForSubmission = async (
  tx: Prisma.TransactionClient,
  project: ProjectForUpdate,
  meta_data: any[],
  userId: string
) => {
  const dataToUpdate = {};
  meta_data.forEach((item) => {
    if (item.field_key && item.value !== undefined && item.value !== null) {
      dataToUpdate[item.field_key] = item.value;
    }
  });

  const validated = UpdateProjectForSubmissionSchema.safeParse(dataToUpdate);
  if (!validated.success) {
    throw new BadRequestError(
      'Meta data contains invalid fields for project update'
    );
  }

  if (validated.data.installment_rounds !== undefined) {
    await assertInstallmentRoundsCanBeUpdated(tx, project.id);
  }

  const oldValue = {};
  Object.keys(validated.data).forEach((key) => {
    oldValue[key] = project[key];
  });

  await tx.project.update({
    where: { id: project.id },
    data: validated.data,
  });

  await createProjectHistoryAndAuditEvent(tx, {
    projectId: project.id,
    action: ProjectActionType.INFORMATION_UPDATE,
    oldValue,
    newValue: validated.data,
    changedBy: userId,
  });
};

export const getProjectSubmissions = async (
  user: AuthPayload,
  projectId: string
): Promise<ProjectSubmissionsResponse> => {
  const project = await prisma.project
    .findUniqueOrThrow({
      where: { id: projectId },
      select: {
        procurement_type: true,
        installment_rounds: true,
        requesting_dept_id: true,
      },
    })
    .catch(() => {
      throw new NotFoundError('Project not found');
    });
  assertCanReadProject(user, project);

  const submissionData = await prisma.projectSubmission.findMany({
    where: { project_id: projectId },
    orderBy: [{ step_order: 'asc' }, { submission_round: 'desc' }],
    include: {
      documents: true,
      submitter: { select: { full_name: true } },
      approver: { select: { full_name: true } },
      proposer: { select: { full_name: true } },
      completer: { select: { full_name: true } },
    },
  });

  const formattedSubmissions = await Promise.all(
    submissionData.map(async (submission) => ({
      ...submission,
      submitted_by: submission.submitter?.full_name ?? null,
      approved_by: submission.approver?.full_name ?? null,
      proposing_by: submission.proposer?.full_name ?? null,
      completed_by: submission.completer?.full_name ?? null,
      documents: await Promise.all(
        submission.documents.map(async (doc) => ({
          field_key: doc.field_key,
          file_name: doc.file_name,
          file_path: doc.file_path,
          download_url: await generatePresignedDownloadUrl(doc.file_path),
        }))
      ),
      submitter: undefined,
      approver: undefined,
      proposer: undefined,
      completer: undefined,
    }))
  );

  const groupByStepOrder = (
    submissions: typeof formattedSubmissions,
    workflowType: UnitResponsibleType
  ) => {
    const map = new Map<
      number,
      {
        step_order: number;
        step_status: SubmissionStatus | 'NOT_STARTED';
        data: typeof formattedSubmissions;
      }
    >();

    for (const stepOrder of WORKFLOW_STEP_ORDERS[workflowType]) {
      map.set(stepOrder, {
        step_order: stepOrder,
        step_status: 'NOT_STARTED',
        data: [],
      });
    }

    for (const submission of submissions) {
      const existing = map.get(submission.step_order);
      if (!existing) continue;
      if (existing.step_status === 'NOT_STARTED') {
        existing.step_status = submission.status;
      }
      existing.data.push(submission);
    }

    return Array.from(map.values()).sort((a, b) => a.step_order - b.step_order);
  };

  const procurementWorkflow =
    project.procurement_type as unknown as UnitResponsibleType;

  const procurementSubmissions = formattedSubmissions.filter(
    (s) => s.workflow_type === procurementWorkflow
  );
  const contractSubmissions = formattedSubmissions.filter(
    (s) => s.workflow_type === UnitResponsibleType.CONTRACT
  );
  const contractByInstallment = Array.from(
    { length: project.installment_rounds },
    (_, index) => {
      const installmentNo = index + 1;
      return {
        installment_no: installmentNo,
        steps: groupByStepOrder(
          contractSubmissions.filter(
            (s) => (s.installment_no ?? 1) === installmentNo
          ),
          UnitResponsibleType.CONTRACT
        ),
      };
    }
  );

  return {
    procurement: groupByStepOrder(procurementSubmissions, procurementWorkflow),
    contract: contractByInstallment,
  };
};

export const getVendorSubmissions = async (
  user: AuthPayload,
  page: number,
  limit: number,
  filter?: VendorSubmissionFilterQuery
): Promise<VendorSubmissionsResponse> => {
  const and: Prisma.ProjectSubmissionWhereInput[] = [
    { submission_type: SubmissionType.VENDOR },
    { workflow_type: UnitResponsibleType.CONTRACT },
  ];
  const projectScope = projectReadWhere(user);
  if (Object.keys(projectScope).length > 0) {
    and.push({ project: projectScope });
  }

  if (filter?.receiveNo?.trim()) {
    const term = filter.receiveNo.trim();
    and.push({
      project: {
        receive_no: {
          contains: term,
          mode: Prisma.QueryMode.insensitive,
        },
      },
    });
  }

  if (filter?.poNo?.trim()) {
    const term = filter.poNo.trim();
    and.push({
      OR: [
        {
          po_no: {
            contains: term,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          project: {
            po_no: {
              contains: term,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      ],
    });
  }

  if (filter?.vendorName?.trim()) {
    const term = filter.vendorName.trim();
    and.push({
      project: {
        vendor_name: {
          contains: term,
          mode: Prisma.QueryMode.insensitive,
        },
      },
    });
  }

  if (filter?.dateFrom || filter?.dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filter.dateFrom) {
      dateFilter.gte = bangkokDayStartUtc(filter.dateFrom);
    }
    if (filter.dateTo) {
      dateFilter.lte = bangkokDayEndUtc(filter.dateTo);
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
        installment_no: true,
        submitted_at: true,
        documents: true,
        project: {
          select: {
            id: true,
            receive_no: true,
            title: true,
            po_no: true,
            vendor_name: true,
            requesting_dept: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.projectSubmission.count({ where }),
  ]);

  const formattedSubmissions = await Promise.all(
    submissions.map(async (submission) => ({
      ...submission,
      project_id: submission.project.id,
      title: submission.project.title,
      receive_no: submission.project.receive_no,
      po_no: submission.po_no || submission.project.po_no || '',
      vendor_name: submission.project.vendor_name || '',
      requester: {
        dept_id: submission.project.requesting_dept.id,
        dept_name: submission.project.requesting_dept.name,
      },
      documents: await Promise.all(
        submission.documents.map(async (doc) => ({
          field_key: doc.field_key,
          file_name: doc.file_name,
          file_path: doc.file_path,
          download_url: await generatePresignedDownloadUrl(doc.file_path),
        }))
      ),
      project: undefined,
    }))
  );

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: formattedSubmissions,
  };
};

export const createStaffSubmissionsProject = async (
  user: AuthPayload,
  data: CreateStaffSubmissionDto
): Promise<SubmissionActionResponse> => {
  assertCapability(user, Capability.SUBMISSION_CREATE);
  const transactionResult = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.project_id },
      select: {
        id: true,
        current_workflow_type: true,
        actual_cost: true,
        pr_no: true,
        po_no: true,
        less_no: true,
        contract_no_id: true,
        installment_rounds: true,
        migo_103_no: true,
        migo_105_no: true,
        asset_code: true,
        vendor_name: true,
        vendor_email: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.current_workflow_type !== data.workflow_type) {
      throw new BadRequestError(
        'Workflow type does not match project current workflow'
      );
    }

    const metaDataMap: Record<string, any> = {};
    if (data.meta_data && Array.isArray(data.meta_data)) {
      data.meta_data.forEach((item) => {
        if (item.field_key && item.value !== undefined && item.value !== null) {
          metaDataMap[item.field_key] = item.value;
        }
      });
    }
    const validatedMeta =
      UpdateProjectForSubmissionSchema.safeParse(metaDataMap);
    if (validatedMeta.success) {
      if (
        validatedMeta.data.pr_no ||
        validatedMeta.data.less_no ||
        validatedMeta.data.po_no ||
        validatedMeta.data.migo_103_no ||
        validatedMeta.data.migo_105_no
      ) {
        await checkRefNumberDuplication(
          tx,
          validatedMeta.data.pr_no ? [validatedMeta.data.pr_no] : [],
          validatedMeta.data.less_no ? [validatedMeta.data.less_no] : [],
          validatedMeta.data.po_no ? [validatedMeta.data.po_no] : [],
          validatedMeta.data.migo_103_no
            ? [validatedMeta.data.migo_103_no]
            : [],
          validatedMeta.data.migo_105_no
            ? [validatedMeta.data.migo_105_no]
            : [],
          project.id
        );
      }
      if (validatedMeta.data.installment_rounds !== undefined) {
        await assertInstallmentRoundsCanBeUpdated(tx, project.id);
      }
    }

    const installmentNo = validateInstallmentNo(
      data.workflow_type,
      data.installment_no,
      project.installment_rounds
    );

    const submission_round = await getSubmissionRound(tx, {
      project_id: data.project_id,
      type: data.type,
      step_order: data.step_order,
      workflow_type: data.workflow_type,
      installment_no: installmentNo,
    });
    const nextStatus: SubmissionStatus = data.required_approval
      ? SubmissionStatus.WAITING_APPROVAL
      : SubmissionStatus.COMPLETED;

    const submission = await tx.projectSubmission.create({
      data: {
        project_id: data.project_id,
        submitted_by: user.id,
        step_order: data.step_order,
        workflow_type: data.workflow_type,
        installment_no: installmentNo,
        submission_round,
        submission_type: SubmissionType.STAFF,
        status: nextStatus,
        staff_remark: data.staff_remark,
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
        installment_no: true,
        status: true,
        staff_remark: true,
      },
    });

    await syncProjectPhases(
      tx,
      submission.workflow_type,
      submission.project_id
    );

    if (nextStatus === SubmissionStatus.COMPLETED && data.required_updating) {
      await updateProjectForSubmission(tx, project, data.meta_data, user.id);
    }
    let notificationResults: PersistedNotificationResult[] = [];
    if (nextStatus === SubmissionStatus.WAITING_APPROVAL) {
      notificationResults = await notifyApprovalRequired(tx, {
        project_id: submission.project_id,
        actor_id: user.id,
        step_order: submission.step_order,
      });
    }
    return { submission, notificationResults };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);

  return transactionResult.submission;
};

export const createVendorSubmissionsProject = async (
  data: CreateVendorSubmissionDto
): Promise<SubmissionActionResponse> => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const project = await tx.project
      .findFirstOrThrow({
        where: { po_no: data.po_no },
        select: {
          id: true,
          current_workflow_type: true,
          installment_rounds: true,
        },
      })
      .catch(() => {
        throw new NotFoundError('Project not found');
      });

    if (project.current_workflow_type !== data.workflow_type) {
      throw new BadRequestError(
        'Workflow type does not match project current workflow'
      );
    }
    const installmentNo = validateInstallmentNo(
      data.workflow_type,
      data.installment_no,
      project.installment_rounds
    );

    const submission_round = await getSubmissionRound(tx, {
      project_id: project.id,
      type: data.type,
      step_order: data.step_order,
      workflow_type: data.workflow_type,
      installment_no: installmentNo,
    });

    const submission = await tx.projectSubmission.create({
      data: {
        project_id: project.id,
        submitted_by: null,
        step_order: data.step_order,
        workflow_type: data.workflow_type,
        installment_no: installmentNo,
        submission_round,
        submission_type: SubmissionType.VENDOR,
        status: SubmissionStatus.COMPLETED,
        po_no: data.po_no,
        meta_data: [{ field_key: 'installment_no', value: installmentNo }],
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
        installment_no: true,
        status: true,
      },
    });
    await syncProjectPhases(
      tx,
      submission.workflow_type,
      submission.project_id
    );
    const notificationResults = await notifyVendorSubmissionReceived(tx, {
      project_id: submission.project_id,
      submission_id: submission.id,
    });
    return { submission, notificationResults };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);

  return transactionResult.submission;
};

export const rejectSubmission = async (
  user: AuthPayload,
  data: RejectSubmissionDto
): Promise<RejectedSubmissionResponse> => {
  assertCapability(user, Capability.SUBMISSION_APPROVE);
  const transactionResult = await prisma.$transaction(async (tx) => {
    const updated = await tx.projectSubmission.update({
      where: { id: data.id },
      data: {
        status: SubmissionStatus.REJECTED,
        comment: data.comment,
        approved_by: user.id,
        approved_at: nowUtc(),
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        installment_no: true,
        submitted_by: true,
        status: true,
        comment: true,
        approved_by: true,
        approved_at: true,
      },
    });
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    const notificationResults = await notifySubmissionRejected(tx, {
      project_id: updated.project_id,
      actor_id: user.id,
      submitter_id: updated.submitted_by,
      step_order: updated.step_order,
      reason: updated.comment,
    });
    return { updated, notificationResults };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);

  return transactionResult.updated;
};

export const approveSubmission = async (
  user: AuthPayload,
  data: ApproveSubmissionDto
): Promise<ApprovedSubmissionResponse> => {
  assertCapability(user, Capability.SUBMISSION_APPROVE);
  const transactionResult = await prisma.$transaction(async (tx) => {
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
        approved_at: nowUtc(),
        approved_by: user.id,
        completed_at: data.required_signature ? null : nowUtc(),
        completed_by: data.required_signature ? null : user.id,
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        installment_no: true,
        status: true,
        approved_at: data.required_signature ? true : false,
        approved_by: data.required_signature ? true : false,
        completed_at: data.required_signature ? false : true,
        completed_by: data.required_signature ? false : true,
      },
    });
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    const notificationResults = data.required_signature
      ? await notifySignatureRequired(tx, {
          project_id: updated.project_id,
          actor_id: user.id,
          step_order: updated.step_order,
        })
      : await notifyWorkflowStepApproved(tx, {
          project_id: updated.project_id,
          actor_id: user.id,
          submitter_id: submission.submitted_by,
          step_order: updated.step_order,
        });
    return { updated, notificationResults };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);
  if (
    shouldSendVendorPoEmailForSubmission({
      workflowType: transactionResult.updated.workflow_type,
      stepOrder: transactionResult.updated.step_order,
      status: transactionResult.updated.status,
    })
  ) {
    await safeSendVendorPoEmail(transactionResult.updated.project_id);
  }

  return transactionResult.updated;
};

export const proposeSubmission = async (
  user: AuthPayload,
  id: string
): Promise<ProposedSubmissionResponse> => {
  assertCapability(user, Capability.SUBMISSION_PROPOSE);
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
        proposing_at: nowUtc(),
        proposing_by: user.id,
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        installment_no: true,
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
  data: CompleteSubmissionDto
): Promise<CompletedSubmissionResponse> => {
  assertCapability(user, Capability.SUBMISSION_SIGN);
  const transactionResult = await prisma.$transaction(async (tx) => {
    const submission = await tx.projectSubmission.findUnique({
      where: { id: data.id },
      select: { status: true, submitted_by: true, meta_data: true },
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
      where: { id: data.id },
      data: {
        status: SubmissionStatus.COMPLETED,
        completed_at: nowUtc(),
        completed_by: user.id,
        signed_at: data.signed_at ?? nowUtc(),
      },
      select: {
        id: true,
        project_id: true,
        workflow_type: true,
        step_order: true,
        submission_round: true,
        installment_no: true,
        status: true,
        completed_at: true,
        completed_by: true,
        signed_at: true,
      },
    });

    if (data.files && data.files.length > 0) {
      await tx.projectDocument.createMany({
        data: data.files.map((file) => ({
          submission_id: data.id,
          field_key: file.field_key ?? null,
          file_name: file.file_name,
          file_path: file.file_path,
        })),
      });
    }
    await syncProjectPhases(tx, updated.workflow_type, updated.project_id);
    if (data.required_updating) {
      const project = await tx.project.findUnique({
        where: { id: updated.project_id },
        select: {
          id: true,
          actual_cost: true,
          pr_no: true,
          po_no: true,
          less_no: true,
          contract_no_id: true,
          migo_103_no: true,
          migo_105_no: true,
          asset_code: true,
          vendor_name: true,
          vendor_email: true,
          installment_rounds: true,
          current_workflow_type: true,
        },
      });
      await updateProjectForSubmission(
        tx,
        project,
        submission.meta_data,
        user.id
      );
    }
    const notificationResults = await notifyWorkflowStepApproved(tx, {
      project_id: updated.project_id,
      actor_id: user.id,
      submitter_id: submission.submitted_by,
      step_order: updated.step_order,
    });
    return { updated, notificationResults };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);
  if (
    shouldSendVendorPoEmailForSubmission({
      workflowType: transactionResult.updated.workflow_type,
      stepOrder: transactionResult.updated.step_order,
      status: transactionResult.updated.status,
    })
  ) {
    await safeSendVendorPoEmail(transactionResult.updated.project_id);
  }

  return transactionResult.updated;
};

