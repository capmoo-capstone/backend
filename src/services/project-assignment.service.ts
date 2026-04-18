import {
  UnitResponsibleType,
  ProjectStatus,
  LogActionType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError, BadRequestError } from '../lib/errors';
import { syncProjectPhases } from '../lib/phase-status';
import { AuthPayload } from '../types/auth.type';
import {
  UpdateStatusProjectsDto,
  UpdateStatusProjectDto,
  AcceptProjectsDto,
} from '../schemas/project.schema';

const resolveAssigneeField = (workflowType: UnitResponsibleType) =>
  workflowType === UnitResponsibleType.CONTRACT
    ? 'assignee_contract'
    : 'assignee_procurement';

export const assignProjectsToUser = async (
  user: AuthPayload,
  data: UpdateStatusProjectsDto
) => {
  return await prisma.$transaction(async (tx) => {
    const projectIds = data.map((d) => d.id);
    const assigneeIds = [...new Set(data.map((d) => d.userId))];

    const projects = await tx.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        status: true,
        current_workflow_type: true,
        assignee_contract: true,
        assignee_procurement: true,
      },
    });

    const assignees = await tx.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, full_name: true },
    });

    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const assigneeMap = new Map(assignees.map((a) => [a.id, a]));

    const updatePromises = [];
    const historyPromises = [];

    for (const item of data) {
      const { id, userId: assigneeId } = item;
      const project = projectMap.get(id);
      const assignee = assigneeMap.get(assigneeId);

      if (!project) throw new NotFoundError(`Project ${id} not found`);
      if (!assignee)
        throw new NotFoundError(`Assignee ${assigneeId} not found`);
      if (project.status !== ProjectStatus.UNASSIGNED) {
        throw new BadRequestError(`Project ${id} is not unassigned`);
      }

      const assigneeField = resolveAssigneeField(project.current_workflow_type);

      if ((project as any)[assigneeField].length > 0) {
        throw new BadRequestError(`Project ${id} is already assigned`);
      }

      updatePromises.push(
        tx.project.update({
          where: {
            id,
            status: ProjectStatus.UNASSIGNED,
            [assigneeField]: { none: {} },
          },
          data: {
            status: ProjectStatus.WAITING_ACCEPT,
            [assigneeField]: { connect: { id: assigneeId } },
          },
          select: { id: true, status: true, [assigneeField]: true },
        })
      );

      historyPromises.push(
        tx.projectHistory.create({
          data: {
            project_id: id,
            action: LogActionType.ASSIGNEE_UPDATE,
            old_value: { status: project.status, [assigneeField]: [] },
            new_value: {
              status: ProjectStatus.WAITING_ACCEPT,
              [assigneeField]: [assigneeId],
            },
            changed_by: user.id,
          },
        })
      );
    }

    const updatedProjects = await Promise.all(updatePromises);
    await Promise.all(historyPromises);

    return { data: updatedProjects };
  });
};

export const changeAssignee = async (
  user: AuthPayload,
  data: UpdateStatusProjectDto
) => {
  const { id, userId: newAssigneeId } = data;
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: {
        status: true,
        current_workflow_type: true,
        assignee_contract: true,
        assignee_procurement: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (project.status !== ProjectStatus.WAITING_ACCEPT) {
      throw new BadRequestError(
        'Assignee can only be changed when project is in WAITING_ACCEPT status'
      );
    }
    const assigneeField = resolveAssigneeField(project.current_workflow_type);

    const oldAssigneeId = (project as any)[assigneeField]?.[0]?.id;
    const newAssignee = await tx.user.findUnique({
      where: { id: newAssigneeId },
      select: { id: true, full_name: true },
    });
    if (!newAssignee) {
      throw new NotFoundError(`New assignee ${newAssigneeId} not found`);
    }

    const updated = await tx.project.update({
      where: { id },
      data: {
        [assigneeField]: {
          disconnect: { id: oldAssigneeId },
          connect: { id: newAssigneeId },
        },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: {
          [assigneeField]: [(project as any)[assigneeField]?.[0]?.id],
        },
        new_value: { [assigneeField]: [newAssigneeId] },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const claimProject = async (user: AuthPayload, projectId: string) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
      },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }
    const assigneeField = resolveAssigneeField(project.current_workflow_type);

    if (project.status !== ProjectStatus.UNASSIGNED) {
      throw new BadRequestError('This project cannot be claimed');
    }

    const updated = await tx.project.update({
      where: {
        id: projectId,
        status: ProjectStatus.UNASSIGNED,
        [assigneeField]: { none: {} },
      },
      data: {
        status: ProjectStatus.IN_PROGRESS,
        [assigneeField]: { connect: { id: user.id } },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });

    await syncProjectPhases(tx, project.current_workflow_type, projectId);

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: project.status, [assigneeField]: [] },
        new_value: { status: updated.status, [assigneeField]: [user.id] },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const acceptProjects = async (
  user: AuthPayload,
  data: AcceptProjectsDto
) => {
  return await prisma.$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      where: { id: { in: data.id } },
      select: {
        id: true,
        status: true,
        assignee_procurement: true,
        assignee_contract: true,
        current_workflow_type: true,
      },
    });

    if (projects.length !== data.id.length) {
      throw new NotFoundError('One or more projects not found');
    }

    const updatePromises = [];
    const historyPromises = [];

    for (const project of projects) {
      const assigneeField = resolveAssigneeField(project.current_workflow_type);

      if (project[assigneeField]?.some((u) => u.id === user.id) === false) {
        throw new BadRequestError(
          `You are not the assignee of project ${project.id}`
        );
      }

      if (project.status !== ProjectStatus.WAITING_ACCEPT) {
        throw new BadRequestError(
          `Project ${project.id} is not in WAITING_ACCEPT status`
        );
      }

      updatePromises.push(
        tx.project.update({
          where: { id: project.id, status: ProjectStatus.WAITING_ACCEPT },
          data: { status: ProjectStatus.IN_PROGRESS },
          select: { id: true, status: true },
        })
      );

      historyPromises.push(
        syncProjectPhases(tx, project.current_workflow_type, project.id),
        tx.projectHistory.create({
          data: {
            project_id: project.id,
            action: LogActionType.STATUS_UPDATE,
            old_value: { status: ProjectStatus.WAITING_ACCEPT },
            new_value: { status: ProjectStatus.IN_PROGRESS },
            changed_by: user.id,
          },
        })
      );
    }

    const updatedProjects = await Promise.all(updatePromises);
    await Promise.all(historyPromises);

    return { data: updatedProjects };
  });
};

export const addAssignee = async (
  user: AuthPayload,
  data: UpdateStatusProjectDto
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: {
        status: true,
        assignee_contract: true,
        assignee_procurement: true,
        current_workflow_type: true,
        _count: {
          select: { assignee_contract: true, assignee_procurement: true },
        },
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (
      project.status in
      [
        ProjectStatus.UNASSIGNED,
        ProjectStatus.WAITING_ACCEPT,
        ProjectStatus.CANCELLED,
        ProjectStatus.CLOSED,
      ]
    ) {
      throw new BadRequestError(
        'Cannot add assignee to project that is not in progress'
      );
    }
    const assigneeField = resolveAssigneeField(project.current_workflow_type);

    if (project._count[assigneeField] >= 2) {
      throw new BadRequestError(
        'Maximum number of assignees reached for this project'
      );
    }

    if (project[assigneeField].some((u) => u.id === data.userId)) {
      throw new BadRequestError('User is already an assignee of this project');
    }
    const assignee = await tx.user.findUnique({
      where: { id: data.userId },
      select: { id: true, full_name: true },
    });
    if (!assignee) {
      throw new NotFoundError(`Assignee ${data.userId} not found`);
    }

    const updated = await tx.project.update({
      where: { id: data.id, [assigneeField]: { none: { id: data.userId } } },
      data: {
        [assigneeField]: {
          connect: { id: data.userId },
        },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { [assigneeField]: project[assigneeField].map((u) => u.id) },
        new_value: { [assigneeField]: updated[assigneeField].map((u) => u.id) },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const returnProject = async (user: AuthPayload, projectId: string) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Only IN_PROGRESS projects can be returned');
    }
    if (project._count.submissions > 0) {
      throw new BadRequestError(
        'Cannot return project with existing submissions'
      );
    }

    const assigneeField = resolveAssigneeField(project.current_workflow_type);

    const updated = await tx.project.update({
      where: {
        id: projectId,
        status: ProjectStatus.IN_PROGRESS,
        [assigneeField]: { some: { id: user.id } },
      },
      data: {
        status: ProjectStatus.UNASSIGNED,
        [assigneeField]: {
          disconnect: { id: user.id },
        },
      },
      select: { id: true, status: true },
    });

    await syncProjectPhases(tx, project.current_workflow_type, updated.id);

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: project.status, [assigneeField]: [user.id] },
        new_value: { status: updated.status, [assigneeField]: [] },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};
