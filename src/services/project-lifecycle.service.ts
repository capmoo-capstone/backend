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
import { CONTRACT_UNIT_ID } from '../utils/constant';
import { nowUtc } from '../utils/date';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { isHeadOfSupplyDept, isHeadOfSupplyUnit } from '../utils/permissions';
import { Capability, assertCapability } from '../utils/access-policy';
import {
  CancelProjectDto,
  CompleteProcurementPhaseDto,
} from '../schemas/project.schema';
import { AuthPayload } from '../types/auth.type';
import {
  CompleteProcurementPhaseResponse,
  ProjectCancellationResponse,
  ProjectIdStatusResponse,
} from '../types/project.type';
import {
  AuditFieldDiff,
  buildProjectCancellationTargetSnapshot,
  createProjectHistoryAndAuditEvent,
  recordAuditEvent,
} from './audit-log.service';
import {
  notifyCancellationRequested,
  notifyProjectAssigned,
  publishPersistedNotifications,
} from './notification/notification.service';

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
  assertCapability(user, Capability.PROJECT_CANCEL);
  const transactionResult = await prisma.$transaction(async (tx) => {
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

    const now = nowUtc();
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

    const notificationResults = !isHead
      ? await notifyCancellationRequested(tx, {
          project_id: data.id,
          actor_id: user.id,
        })
      : [];

    return {
      response: toCancellationResponse(cancelled),
      notificationResults,
    };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);

  return transactionResult.response;
};

export const approveCancellation = async (
  user: AuthPayload,
  id: string
): Promise<ProjectIdStatusResponse> => {
  assertCapability(user, Capability.PROJECT_APPROVE_CANCELLATION);
  return await prisma.$transaction(async (tx) => {
    const now = nowUtc();
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
  assertCapability(user, Capability.PROJECT_APPROVE_CANCELLATION);
  return await prisma.$transaction(async (tx) => {
    const now = nowUtc();
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
  assertCapability(user, Capability.PROJECT_COMPLETE_PROCUREMENT);
  const transactionResult = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: {
        status: true,
        current_workflow_type: true,
        procurement_progress: true,
        responsible_unit_id: true,
        procurement_completed_at: true,
        contract_started_at: true,
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

    const transitionAt = nowUtc();
    const hasContractAssignee = Boolean(data.assignee_contract);

    const dataToUpdate: Prisma.ProjectUncheckedUpdateInput = {
      current_workflow_type: UnitResponsibleType.CONTRACT,
      procurement_completed_at: transitionAt,
      status: hasContractAssignee
        ? ProjectStatus.WAITING_ACCEPT
        : ProjectStatus.UNASSIGNED,
      contract_started_at: hasContractAssignee ? transitionAt : undefined,
      responsible_unit_id: data.contract_unit_id,
      assignee_contract: data.assignee_contract
        ? { connect: { id: data.assignee_contract } }
        : undefined,
    };

    const oldValue: Record<string, unknown> = {};
    for (const key of Object.keys(dataToUpdate)) {
      oldValue[key] = project[key as keyof typeof project];
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
      action: !data.assignee_contract
        ? ProjectActionType.STATUS_UPDATE
        : ProjectActionType.ASSIGNEE_UPDATE,
      oldValue,
      newValue: dataToUpdate,
      changedBy: user,
    });
    const notificationResults =
      updated.assignee_contract.length > 0
        ? await notifyProjectAssigned(tx, {
            project_id: data.id,
            assignee_ids: updated.assignee_contract.map(
              (assignee) => assignee.id
            ),
            actor_id: user.id,
          })
        : [];

    return { updated, notificationResults };
  });

  await publishPersistedNotifications(transactionResult.notificationResults);

  return transactionResult.updated;
};

export const closeProject = async (
  user: AuthPayload,
  projectId: string
): Promise<ProjectIdStatusResponse> => {
  assertCapability(user, Capability.PROJECT_CLOSE);
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
    if (project.status !== ProjectStatus.WAITING_CLOSE) {
      throw new BadRequestError(
        'Project cannot be closed unless it is in WAITING_CLOSE status'
      );
    }
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
