import {
  AuditEventType,
  AuditLogType,
  AuditTargetType,
  Prisma,
  ProjectActionType,
  ProjectCancellationStatus,
  ProjectStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { CONTRACT_UNIT_ID } from '../lib/constant';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { isHeadOfSupplyDept, isHeadOfSupplyUnit } from '../lib/permissions';
import {
  CancelProjectDto,
  CompleteProcurementPhaseDto,
  RequestEditProjectDto,
} from '../schemas/project.schema';
import { AuthPayload } from '../types/auth.type';
import {
  CompleteContractPhaseResponse,
  CompleteProcurementPhaseResponse,
  ProjectCancellationResponse,
  ProjectIdStatusResponse,
  RequestEditProjectResponse,
} from '../types/project.type';
import {
  AuditFieldDiff,
  buildProjectCancellationTargetSnapshot,
  createProjectHistoryAndAuditEvent,
  recordAuditEvent,
} from './audit-log.service';

const recordCancellationAuditEvent = async (
  tx: Prisma.TransactionClient,
  input: {
    eventType: AuditEventType;
    cancellation: {
      id: string;
      project_id: string;
      reason?: string | null;
    };
    actor: AuthPayload;
    diff: AuditFieldDiff[];
    comment?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }
) => {
  await recordAuditEvent(tx, {
    kind: AuditLogType.PROJECT_CANCELLATION,
    eventType: input.eventType,
    targetType: AuditTargetType.PROJECT_CANCELLATION,
    targetId: input.cancellation.id,
    projectId: input.cancellation.project_id,
    actor: input.actor,
    targetSnapshot: await buildProjectCancellationTargetSnapshot(
      tx,
      input.cancellation
    ),
    diff: input.diff,
    comment: input.comment ?? null,
    metadata: input.metadata ?? null,
    sourceTable: 'project_cancellations',
    sourceId: input.cancellation.id,
    occurredAt: input.occurredAt,
  });
};

const cancellationEventSelect = {
  id: true,
  project_id: true,
  reason: true,
  status: true,
  requested_at: true,
  decision_by: true,
  decision_at: true,
} satisfies Prisma.ProjectCancellationSelect;

type CancellationEventRecord = Prisma.ProjectCancellationGetPayload<{
  select: typeof cancellationEventSelect;
}>;

const toCancellationResponse = (
  cancellation: CancellationEventRecord
): ProjectCancellationResponse => ({
  project_id: cancellation.project_id,
  reason: cancellation.reason,
  status: cancellation.status,
});

const findProjectStatusOrThrow = async (
  tx: Prisma.TransactionClient,
  projectId: string
) => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) throw new NotFoundError('Project not found');
  return project.status;
};

const findPendingCancellationOrThrow = async (
  tx: Prisma.TransactionClient,
  projectId: string
) => {
  const cancellation = await tx.projectCancellation.findFirst({
    where: {
      project_id: projectId,
      status: ProjectCancellationStatus.PENDING,
    },
    select: cancellationEventSelect,
  });
  if (!cancellation) {
    throw new BadRequestError('Active cancellation request not found');
  }
  return cancellation;
};

const updateProjectStatusWithHistory = async (
  tx: Prisma.TransactionClient,
  user: AuthPayload,
  projectId: string,
  oldStatus: ProjectStatus,
  newStatus: ProjectStatus
) => {
  const updated = await tx.project.update({
    where: { id: projectId },
    data: { status: newStatus },
    select: { id: true, status: true },
  });
  const updatedProject = updated ?? { id: projectId, status: newStatus };

  await createProjectHistoryAndAuditEvent(tx, {
    projectId,
    action: ProjectActionType.STATUS_UPDATE,
    oldValue: { status: oldStatus },
    newValue: { status: updatedProject.status },
    changedBy: user,
  });

  return updatedProject;
};

const createCancellationAudit = async (
  tx: Prisma.TransactionClient,
  user: AuthPayload,
  cancellation: CancellationEventRecord,
  projectStatus: ProjectStatus,
  occurredAt: Date = cancellation.requested_at
) => {
  await recordCancellationAuditEvent(tx, {
    eventType: AuditEventType.PROJECT_CANCELLATION_CREATED,
    cancellation,
    actor: user,
    diff: [
      {
        field: 'cancellation.status',
        oldValue: null,
        newValue: cancellation.status,
      },
    ],
    comment: cancellation.reason,
    metadata: {
      projectStatus,
      requestedAt: cancellation.requested_at,
    },
    occurredAt,
  });
};

const recordCancellationDecisionAudit = async (
  tx: Prisma.TransactionClient,
  input: {
    eventType: AuditEventType;
    before: CancellationEventRecord;
    after: CancellationEventRecord;
    actor: AuthPayload;
    comment?: string;
    projectOldStatus: ProjectStatus;
    projectNewStatus: ProjectStatus;
    extraDiff: AuditFieldDiff[];
    metadata: Record<string, unknown>;
    occurredAt: Date;
  }
) => {
  await recordCancellationAuditEvent(tx, {
    eventType: input.eventType,
    cancellation: input.after,
    actor: input.actor,
    diff: [
      {
        field: 'cancellation.status',
        oldValue: input.before.status,
        newValue: input.after.status,
      },
      ...input.extraDiff,
      {
        field: 'project.status',
        oldValue: input.projectOldStatus,
        newValue: input.projectNewStatus,
      },
    ],
    comment: input.comment,
    metadata: {
      requestedAt: input.before.requested_at,
      ...input.metadata,
    },
    occurredAt: input.occurredAt,
  });
};

export const cancelProject = async (
  user: AuthPayload,
  data: CancelProjectDto
): Promise<ProjectCancellationResponse> => {
  return await prisma.$transaction(async (tx) => {
    const projectStatus = await findProjectStatusOrThrow(tx, data.id);
    const cancellation = await tx.projectCancellation.findFirst({
      where: {
        project_id: data.id,
        status: {
          in: [
            ProjectCancellationStatus.PENDING,
            ProjectCancellationStatus.APPROVED,
          ],
        },
      },
    });
    if (cancellation) {
      throw new BadRequestError(
        'There is already an active cancellation request'
      );
    }

    const isHead = isHeadOfSupplyDept(user) || isHeadOfSupplyUnit(user);

    if (projectStatus === ProjectStatus.CANCELLED) {
      throw new BadRequestError('Project is already cancelled');
    }
    if (!isHead && projectStatus === ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Cancellation is already requested');
    }

    const now = new Date();
    const targetProjectStatus = isHead
      ? ProjectStatus.CANCELLED
      : ProjectStatus.WAITING_CANCEL;
    const targetCancellationStatus = isHead
      ? ProjectCancellationStatus.APPROVED
      : ProjectCancellationStatus.PENDING;

    const updated = await updateProjectStatusWithHistory(
      tx,
      user,
      data.id,
      projectStatus,
      targetProjectStatus
    );

    const cancelled = await tx.projectCancellation.create({
      data: {
        project_id: data.id,
        reason: data.reason,
        status: targetCancellationStatus,
        requested_by: user.id,
        ...(isHead
          ? {
              decision_by: user.id,
              decision_at: now,
              decision_comment: data.reason,
            }
          : {}),
      },
      select: cancellationEventSelect,
    });

    await createCancellationAudit(tx, user, cancelled, updated.status);

    if (isHead) {
      await recordCancellationDecisionAudit(tx, {
        eventType: AuditEventType.PROJECT_CANCELLATION_APPROVED,
        before: {
          ...cancelled,
          status: ProjectCancellationStatus.PENDING,
          decision_by: null,
          decision_at: null,
        },
        after: cancelled,
        actor: user,
        comment: data.reason,
        projectOldStatus: projectStatus,
        projectNewStatus: updated.status,
        extraDiff: [
          {
            field: 'cancellation.decision_by',
            oldValue: null,
            newValue: user.id,
          },
        ],
        metadata: {
          decisionAt: cancelled.decision_at,
          directApproval: true,
        },
        occurredAt: cancelled.decision_at ?? now,
      });
    }

    return toCancellationResponse(cancelled);
  });
};

export const approveCancellation = async (
  user: AuthPayload,
  id: string
): Promise<ProjectIdStatusResponse> => {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    const projectStatus = await findProjectStatusOrThrow(tx, id);
    if (projectStatus !== ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Project is not in WAITING_CANCEL status');
    }

    const cancellation = await findPendingCancellationOrThrow(tx, id);
    const updated = await updateProjectStatusWithHistory(
      tx,
      user,
      id,
      projectStatus,
      ProjectStatus.CANCELLED
    );

    const approvedCancellation = await tx.projectCancellation.update({
      where: { id: cancellation.id },
      data: {
        status: ProjectCancellationStatus.APPROVED,
        decision_by: user.id,
        decision_at: now,
      },
      select: cancellationEventSelect,
    });

    await recordCancellationDecisionAudit(tx, {
      eventType: AuditEventType.PROJECT_CANCELLATION_APPROVED,
      before: cancellation,
      after: approvedCancellation,
      actor: user,
      projectOldStatus: projectStatus,
      projectNewStatus: updated.status,
      extraDiff: [
        {
          field: 'cancellation.decision_by',
          oldValue: cancellation.decision_by,
          newValue: approvedCancellation.decision_by,
        },
      ],
      metadata: {
        decisionAt: approvedCancellation.decision_at,
      },
      occurredAt: approvedCancellation.decision_at ?? now,
    });
    return updated;
  });
};

export const rejectCancellation = async (
  user: AuthPayload,
  id: string
): Promise<ProjectIdStatusResponse> => {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    const projectStatus = await findProjectStatusOrThrow(tx, id);
    if (projectStatus !== ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Project is not in WAITING_CANCEL status');
    }

    const lastHistory = await tx.projectHistory.findFirst({
      where: {
        project_id: id,
        action: ProjectActionType.STATUS_UPDATE,
        new_value: {
          path: ['status'],
          equals: ProjectStatus.WAITING_CANCEL,
        },
      },
      orderBy: { changed_at: 'desc' },
      select: { old_value: true },
    });

    const lastStatus = (lastHistory?.old_value as { status?: ProjectStatus })
      ?.status;
    if (!lastStatus) {
      throw new BadRequestError(
        'Previous status not found, cannot reject cancellation'
      );
    }

    const cancellation = await findPendingCancellationOrThrow(tx, id);
    const updated = await updateProjectStatusWithHistory(
      tx,
      user,
      id,
      projectStatus,
      lastStatus
    );

    const rejectedCancellation = await tx.projectCancellation.update({
      where: { id: cancellation.id },
      data: {
        status: ProjectCancellationStatus.REJECTED,
        decision_by: user.id,
        decision_at: now,
      },
      select: cancellationEventSelect,
    });

    await recordCancellationDecisionAudit(tx, {
      eventType: AuditEventType.PROJECT_CANCELLATION_REJECTED,
      before: cancellation,
      after: rejectedCancellation,
      actor: user,
      projectOldStatus: projectStatus,
      projectNewStatus: updated.status,
      extraDiff: [
        {
          field: 'cancellation.decision_by',
          oldValue: cancellation.decision_by,
          newValue: rejectedCancellation.decision_by,
        },
      ],
      metadata: {
        decisionAt: rejectedCancellation.decision_at,
      },
      occurredAt: rejectedCancellation.decision_at ?? now,
    });

    return updated;
  });
};

export const completeProcurementPhase = async (
  user: AuthPayload,
  data: CompleteProcurementPhaseDto
): Promise<CompleteProcurementPhaseResponse> => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: {
        status: true,
        current_workflow_type: true,
        procurement_progress: true,
        responsible_unit_id: true,
        assignee_procurement: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    if (project.current_workflow_type === UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is already in CONTRACT workflow type');
    }

    let dataToUpdate: any = {
      current_workflow_type: UnitResponsibleType.CONTRACT,
    };

    if (data.continue_unit_proc) {
      dataToUpdate = {
        ...dataToUpdate,
        assignee_contract: {
          connect: project.assignee_procurement.map((u) => ({ id: u.id })),
        },
      };
    } else if (data.assignee_contract) {
      dataToUpdate = {
        ...dataToUpdate,
        status: ProjectStatus.WAITING_ACCEPT,
        responsible_unit_id: CONTRACT_UNIT_ID,
        assignee_contract: { connect: { id: data.assignee_contract } },
      };
    } else {
      dataToUpdate = {
        ...dataToUpdate,
        status: ProjectStatus.UNASSIGNED,
        responsible_unit_id: CONTRACT_UNIT_ID,
      };
    }

    const oldValue = {};
    for (const key in dataToUpdate) {
      oldValue[key] = project[key];
    }

    const updated = await tx.project.update({
      where: { id: data.id },
      data: dataToUpdate,
      select: {
        id: true,
        status: true,
        current_workflow_type: true,
        responsible_unit_id: true,
        assignee_contract: true,
      },
    });
    await createProjectHistoryAndAuditEvent(tx, {
      projectId: data.id,
      action:
        !data.assignee_contract && !data.continue_unit_proc
          ? ProjectActionType.STATUS_UPDATE
          : ProjectActionType.ASSIGNEE_UPDATE,
      oldValue,
      newValue: dataToUpdate,
      changedBy: user,
    });
    return updated;
  });
};

export const completeContractPhase = async (
  user: AuthPayload,
  projectId: string
): Promise<CompleteContractPhaseResponse> => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        contract_progress: true,
        responsible_unit_id: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    // if (project.contract_phase !== ProjectPhaseStatus.NOT_EXPORTED) {
    //   throw new BadRequestError('Contract phase is not in NOT_EXPORTED status');
    // }
    if (project.current_workflow_type !== UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is not in CONTRACT workflow type');
    }

    // const updated = await tx.project.update({
    //   where: { id: projectId },
    //   data: {
    //     contract_progress:
    //       updatedContractProgress as unknown as Prisma.InputJsonValue,
    //   },
    //   select: {
    //     id: true,
    //     status: true,
    //     contract_progress: true,
    //   },
    // });
    // await tx.projectHistory.create({
    //   data: {
    //     project_id: projectId,
    //     action: ProjectActionType.STATUS_UPDATE,
    //     old_value: {
    //       contract_progress: {
    //         other: { status: contractWorkflowStatus, step: null },
    //       },
    //     },
    //     new_value: {
    //       contract_progress: {
    //         other: updatedContractProgress.other,
    //       },
    //     },
    //     changed_by: user.id,
    //   },
    // });

    return {
      id: projectId,
      status: project.status,
    };
  });
};

export const closeProject = async (
  user: AuthPayload,
  projectId: string
): Promise<ProjectIdStatusResponse> => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        contract_progress: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    const closableStatuses: ProjectStatus[] = [
      ProjectStatus.IN_PROGRESS,
      ProjectStatus.REQUEST_EDIT,
    ];

    if (!closableStatuses.includes(project.status)) {
      throw new BadRequestError(
        'Project cannot be closed unless it is in IN_PROGRESS or REQUEST_EDIT status'
      );
    }
    // if (project.contract_phase !== ProjectPhaseStatus.COMPLETED) {
    //   throw new BadRequestError('Contract phase is not in COMPLETED status');
    // }
    if (project.current_workflow_type !== UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is not in CONTRACT workflow type');
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.CLOSED,
      },
      select: { id: true, status: true },
    });
    await createProjectHistoryAndAuditEvent(tx, {
      projectId,
      action: ProjectActionType.STATUS_UPDATE,
      oldValue: {
        status: project.status,
      },
      newValue: {
        status: updated.status,
      },
      changedBy: user,
    });

    return updated;
  });
};

export const requestEditProject = async (
  user: AuthPayload,
  data: RequestEditProjectDto
): Promise<RequestEditProjectResponse> => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.CLOSED) {
      throw new BadRequestError('Project is not in CLOSED status');
    }

    const updated = await tx.project.update({
      where: { id: data.id },
      data: {
        status: ProjectStatus.REQUEST_EDIT,
        request_edit_reason: data.reason,
      },
      select: { id: true, status: true, request_edit_reason: true },
    });

    await createProjectHistoryAndAuditEvent(tx, {
      projectId: data.id,
      action: ProjectActionType.STATUS_UPDATE,
      oldValue: { status: project.status },
      newValue: { status: updated.status, request_edit_reason: data.reason },
      changedBy: user,
    });
    return updated;
  });
};
