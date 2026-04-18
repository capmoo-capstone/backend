import {
  UserRole,
  ProjectStatus,
  LogActionType,
  ProjectPhaseStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { CONTRACT_UNIT_ID } from '../lib/constant';
import { NotFoundError, BadRequestError } from '../lib/errors';
import { AuthPayload } from '../types/auth.type';
import {
  CancelProjectDto,
  RequestEditProjectDto,
} from '../schemas/project.schema';

export const cancelProject = async (
  user: AuthPayload,
  data: CancelProjectDto
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const cancellation = await tx.projectCancellation.findFirst({
      where: { project_id: data.id, is_active: true },
    });
    if (cancellation) {
      throw new BadRequestError(
        'There is already an active cancellation request'
      );
    }

    const isHead =
      user.roles.some((r) => r.role === UserRole.HEAD_OF_UNIT) ||
      user.roles.some((r) => r.role === UserRole.HEAD_OF_DEPARTMENT);

    if (!isHead) {
      if (project.status === ProjectStatus.CANCELLED) {
        throw new BadRequestError('Project is already cancelled');
      }
      if (project.status === ProjectStatus.WAITING_CANCEL) {
        throw new BadRequestError('Cancellation is already requested');
      }

      const updated = await tx.project.update({
        where: { id: data.id },
        data: {
          status: ProjectStatus.WAITING_CANCEL,
        },
        select: { id: true, status: true },
      });

      await tx.projectHistory.create({
        data: {
          project_id: data.id,
          action: LogActionType.STATUS_UPDATE,
          old_value: { status: project.status },
          new_value: { status: updated.status },
          changed_by: user.id,
        },
      });

      const cancelled = await tx.projectCancellation.create({
        data: {
          project_id: data.id,
          reason: data.reason,
          is_active: true,
          is_cancelled: false,
          requested_by: user.id,
        },
        select: { project_id: true, reason: true, is_cancelled: true },
      });

      return { data: cancelled };
    }

    await tx.project.update({
      where: { id: data.id },
      data: {
        status: ProjectStatus.CANCELLED,
      },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: ProjectStatus.CANCELLED },
        changed_by: user.id,
      },
    });

    const cancelled = await tx.projectCancellation.create({
      data: {
        project_id: data.id,
        reason: data.reason,
        is_active: true,
        is_cancelled: true,
        requested_by: user.id,
        approved_by: user.id,
      },
      select: { project_id: true, reason: true, is_cancelled: true },
    });

    return { data: cancelled };
  });
};

export const approveCancellation = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Project is not in WAITING_CANCEL status');
    }
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.CANCELLED,
      },
      select: { id: true, status: true },
    });

    await tx.projectCancellation.updateMany({
      where: { project_id: projectId },
      data: {
        is_cancelled: true,
        approved_by: user.id,
        approved_at: new Date(),
      },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: updated.status },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const rejectCancellation = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Project is not in WAITING_CANCEL status');
    }

    const lastHistory = await tx.projectHistory.findFirst({
      where: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        new_value: {
          path: ['status'],
          equals: ProjectStatus.WAITING_CANCEL,
        },
      },
      orderBy: { changed_at: 'desc' },
      select: { old_value: true },
    });

    const lastStatus = (lastHistory?.old_value as any)?.status ?? undefined;
    if (!lastStatus) {
      throw new BadRequestError(
        'Previous status not found, cannot reject cancellation'
      );
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: lastStatus,
      },
      select: { id: true, status: true },
    });

    await tx.projectCancellation.deleteMany({
      where: { project_id: projectId },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: updated.status },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const completeProcurementPhase = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        procurement_status: true,
        responsible_unit_id: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    if (project.procurement_status !== ProjectPhaseStatus.COMPLETED) {
      throw new BadRequestError('Procurement phase is not in COMPLETED status');
    }
    if (project.current_workflow_type === UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is already in CONTRACT workflow type');
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: UnitResponsibleType.CONTRACT,
        responsible_unit_id: CONTRACT_UNIT_ID,
      },
      select: {
        id: true,
        status: true,
        current_workflow_type: true,
        responsible_unit_id: true,
      },
    });
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: {
          status: project.status,
          current_workflow_type: project.current_workflow_type,
          responsible_unit_id: project.responsible_unit_id,
        },
        new_value: {
          status: ProjectStatus.UNASSIGNED,
          current_workflow_type: UnitResponsibleType.CONTRACT,
          responsible_unit_id: CONTRACT_UNIT_ID,
        },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const completeContractPhase = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        contract_status: true,
        responsible_unit_id: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    if (project.contract_status !== ProjectPhaseStatus.NOT_EXPORTED) {
      throw new BadRequestError('Contract phase is not in NOT_EXPORTED status');
    }
    if (project.current_workflow_type !== UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is not in CONTRACT workflow type');
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        contract_status: ProjectPhaseStatus.COMPLETED,
      },
      select: {
        id: true,
        status: true,
        contract_status: true,
      },
    });
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: {
          contract_status: project.contract_status,
        },
        new_value: {
          contract_status: updated.contract_status,
        },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const closeProject = async (user: AuthPayload, projectId: string) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        contract_status: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    if (project.contract_status !== ProjectPhaseStatus.COMPLETED) {
      throw new BadRequestError('Contract phase is not in COMPLETED status');
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
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: {
          status: project.status,
        },
        new_value: {
          status: updated.status,
        },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const requestEditProject = async (
  user: AuthPayload,
  data: RequestEditProjectDto
) => {
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
      select: { id: true, status: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: updated.status, request_edit_reason: data.reason },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};
