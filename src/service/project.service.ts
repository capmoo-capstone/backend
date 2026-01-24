import { prisma } from '../config/prisma';
import {
  LogActionType,
  Project,
  ProjectStatus,
  UnitResponsibleType,
} from '../../generated/prisma/client';
import {
  CancelProjectDto,
  CreateProjectDto,
  PaginatedProjects,
  UpdateProjectDto,
  UpdateStatusProjectDto,
  UpdateStatusProjectsDto,
} from '../models/Project';
import { BadRequestError, NotFoundError } from '../lib/errors';
import * as UserService from './user.service';
import * as UnitService from './unit.service';

export const listProjects = async (
  page: number,
  limit: number
): Promise<PaginatedProjects> => {
  const skip = (page - 1) * limit;

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      skip: skip,
      take: limit,
      orderBy: { id: 'desc' },
    }),
    prisma.project.count(),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  };
};

export const createProject = async (
  data: CreateProjectDto
): Promise<Project> => {
  return await prisma.$transaction(async (tx) => {
    const receiveNumber = ((await tx.project.count()) + 1).toString();
    return await tx.project.create({
      data: {
        receive_no: receiveNumber.toString(),
        ...data,
      },
    });
  });
};

export const getById = async (id: string): Promise<Project> => {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      template: {
        select: {
          type: true,
        },
      },
      assignee_procurement: {
        select: {
          full_name: true,
        },
      },
      assignee_contract: {
        select: {
          full_name: true,
        },
      },
    },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  return project;
};

export const getUnassignedProjectsByUnit = async (
  page: number,
  limit: number,
  unitId: string
): Promise<PaginatedProjects> => {
  const unit = await UnitService.getById(unitId);
  const where: any = {
    status: {
      in: [
        ProjectStatus.PROCUREMENT_UNASSIGNED,
        ProjectStatus.CONTRACT_UNASSIGNED,
      ],
    },
    template: {
      type: {
        in: unit.type,
      },
    },
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ is_urgent: 'desc' }, { created_at: 'asc' }],
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  };
};

export const getAssignedProjectsByUnitAndDate = async (
  page: number,
  limit: number,
  unitId: string,
  targetDate: Date
): Promise<PaginatedProjects> => {
  const unit = await UnitService.getById(unitId);

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const acceptedProjectIds = await prisma.projectHistory.findMany({
    where: {
      AND: [
        {
          OR: [
            {
              action: LogActionType.STATUS_UPDATE,
            },
            {
              action: LogActionType.ASSIGNEE_UPDATE,
            },
          ],
        },
        {
          changed_at: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        {
          OR: [
            {
              new_value: {
                path: ['status'],
                equals: ProjectStatus.PROCUREMENT_IN_PROGRESS,
              },
            },
            {
              new_value: {
                path: ['status'],
                equals: ProjectStatus.CONTRACT_IN_PROGRESS,
              },
            },
          ],
        },
      ],
    },
    select: { project_id: true },
    distinct: ['project_id'],
  });

  const cancelledProjectIds = await prisma.projectCancellation.findMany({
    where: {
      cancelled_at: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: { project_id: true },
    distinct: ['project_id'],
  });

  const acceptedIds = acceptedProjectIds.map((h) => h.project_id);
  const cancelledIds = cancelledProjectIds.map((h) => h.project_id);

  const where: any = {
    template: {
      type: {
        in: unit.type,
      },
    },
    OR: [
      {
        id: {
          in: acceptedIds,
        },
      },
      {
        status: {
          in: [
            ProjectStatus.PROCUREMENT_WAITING_ACCEPTANCE,
            ProjectStatus.CONTRACT_WAITING_ACCEPTANCE,
          ],
        },
      },
      {
        id: {
          in: cancelledIds,
        },
      },
    ],
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ is_urgent: 'desc' }, { created_at: 'asc' }],
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  };
};

const checkProjectStatusToAssign = (
  project: Project & { template: { type: UnitResponsibleType } }
) => {
  const assigneeField =
    project.template.type === UnitResponsibleType.CONTRACT
      ? 'assignee_contract_id'
      : 'assignee_procurement_id';
  const nextStatus =
    project.template.type === UnitResponsibleType.CONTRACT
      ? [
          ProjectStatus.CONTRACT_UNASSIGNED,
          ProjectStatus.CONTRACT_WAITING_ACCEPTANCE,
          ProjectStatus.CONTRACT_IN_PROGRESS,
        ]
      : [
          ProjectStatus.PROCUREMENT_UNASSIGNED,
          ProjectStatus.PROCUREMENT_WAITING_ACCEPTANCE,
          ProjectStatus.PROCUREMENT_IN_PROGRESS,
        ];
  return { assigneeField, nextStatus };
};

export const assignProjectsToUser = async (data: UpdateStatusProjectsDto) => {
  return await prisma.$transaction(async (tx) => {
    const updatedProjects = [];
    for (const item of data) {
      const { id, userId } = item;

      const project = await tx.project.findUnique({
        where: { id },
        include: {
          template: true,
        },
      });

      if (!project) {
        throw new BadRequestError(`Project ${id} not found`);
      }
      const { assigneeField, nextStatus } = checkProjectStatusToAssign(project);
      await UserService.getById(userId);

      if (project.status !== nextStatus[0]) {
        throw new BadRequestError(`Project ${id} is not unassigned`);
      }
      if ((project as any)[assigneeField] !== null) {
        throw new BadRequestError(`Project ${id} is already assigned`);
      }

      const updated = await tx.project.update({
        where: {
          id,
          status: nextStatus[0],
          [assigneeField]: null,
        },
        data: {
          [assigneeField]: userId,
          status: nextStatus[1],
        },
        select: { id: true, status: true, [assigneeField]: true },
      });

      updatedProjects.push(updated);

      await tx.projectHistory.create({
        data: {
          project_id: id,
          action: LogActionType.ASSIGNEE_UPDATE,
          old_value: { status: project.status, assignee: null },
          new_value: { status: updated.status, assignee: userId },
          changed_by: 'system',
        },
      });
    }
    return { data: updatedProjects };
  });
};

export const claimProject = async (data: UpdateStatusProjectDto) => {
  const { id, userId } = data;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      template: true,
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }
  const { assigneeField, nextStatus } = checkProjectStatusToAssign(project);

  if (project.status !== nextStatus[0]) {
    throw new BadRequestError('This project cannot be claimed');
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: {
        id,
        status: nextStatus[0],
        [assigneeField]: null,
      },
      data: {
        [assigneeField]: userId,
        status: nextStatus[2],
      },
      select: { id: true, status: true, [assigneeField]: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: project.status, assignee: null },
        new_value: { status: updated.status, assignee: userId },
        changed_by: 'system',
      },
    });

    return { data: updated };
  });
};

export const acceptProjects = async (data: UpdateStatusProjectsDto) => {
  return await prisma.$transaction(async (tx) => {
    const updatedProjects = [];
    for (const item of data) {
      const { id, userId } = item;
      const project = await tx.project.findUnique({
        where: { id },
        include: {
          template: true,
        },
      });
      if (!project) {
        throw new NotFoundError(`Project ${id} not found`);
      }
      const { assigneeField, nextStatus } = checkProjectStatusToAssign(project);
      if (project.status !== nextStatus[1]) {
        throw new BadRequestError(
          `Project ${id} cannot be accepted at this status`
        );
      }
      if ((project as any)[assigneeField] !== userId) {
        throw new BadRequestError(`You are not assigned to project ${id}`);
      }
      const updated = await tx.project.update({
        where: {
          id,
          status: nextStatus[1],
          [assigneeField]: userId,
        },
        data: {
          status: nextStatus[2],
        },
        select: { id: true, status: true, [assigneeField]: true },
      });
      updatedProjects.push(updated);

      await tx.projectHistory.create({
        data: {
          project_id: id,
          action: LogActionType.STATUS_UPDATE,
          old_value: { status: project.status },
          new_value: { status: updated.status },
          changed_by: 'system',
        },
      });
    }

    return { data: updatedProjects };
  });
};

export const cancelProject = async (data: CancelProjectDto) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: { status: true },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const updated = await tx.project.update({
      where: { id: data.id },
      data: {
        status: ProjectStatus.CANCELLED,
      },
      select: { id: true, status: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: ProjectStatus.CANCELLED },
        changed_by: 'system',
      },
    });

    const cancelled = await tx.projectCancellation.create({
      data: {
        project_id: data.id,
        reason: data.reason,
        cancelled_by: 'system',
      },
      select: { reason: true },
    });

    return {
      id: updated.id,
      status: updated.status,
      reason: cancelled.reason,
    };
  });
};

export const updateProjectData = async (data: UpdateProjectDto) => {
  if (!data || !data.updateData || Object.keys(data.updateData).length === 0) {
    throw new BadRequestError('No data provided for update');
  }
  await getById(data.id);
  return await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: data.id },
      data: { ...data.updateData },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.INFORMATION_UPDATE,
        old_value: {},
        new_value: { ...data.updateData },
        changed_by: 'system',
      },
    });
  });
};

export const deleteProject = async (id: string): Promise<void> => {
  await getById(id);
  await prisma.project.delete({
    where: { id },
  });
};
