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
  ProjectsListResponse,
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
  unitId: string
): Promise<ProjectsListResponse> => {
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
      orderBy: [{ status: 'asc' }, { receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        request_unit_id: true,
        budget: true,
        procurement_type: true,
        template: { select: { type: true } },
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects.map((project) => {
      return {
        ...project,
        template_type: project.template.type,
        template: undefined,
      };
    }),
  };
};

export const getAssignedProjects = async (
  targetDate: Date,
  options: { unitId?: string; userId?: string }
): Promise<ProjectsListResponse> => {
  if (!options?.unitId && !options?.userId) {
    throw new BadRequestError('Either unitId or userId must be provided');
  }

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  let where: any = {
    AND: [
      {
        OR: [
          {
            status: {
              in: [
                ProjectStatus.PROCUREMENT_WAITING_ACCEPTANCE,
                ProjectStatus.CONTRACT_WAITING_ACCEPTANCE,
              ],
            },
          },
          {
            project_histories: {
              some: {
                AND: [
                  {
                    OR: [
                      { action: LogActionType.STATUS_UPDATE },
                      { action: LogActionType.ASSIGNEE_UPDATE },
                    ],
                  },
                  { changed_at: { gte: startOfDay, lte: endOfDay } },
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
            },
          },
        ],
      },
    ],
  };

  if (options.unitId) {
    // Unit-based query
    const unit = await prisma.unit.findUnique({
      where: { id: options.unitId },
      select: { type: true },
    });

    if (!unit) {
      throw new NotFoundError('Unit not found');
    }
    where.AND.push({
      template: {
        type: {
          in: unit.type,
        },
      },
    });
  } else if (options.userId) {
    // User-based query
    where.AND.push({
      OR: [
        { assignee_procurement_id: options.userId },
        { assignee_contract_id: options.userId },
      ],
    });
  }

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      orderBy: [{ status: 'asc' }, { receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        request_unit_id: true,
        budget: true,
        procurement_type: true,
        template: { select: { type: true } },
        current_step: {
          select: { name: true, order: true },
        },
        assignee_procurement: { select: { id: true, full_name: true } },
        assignee_contract: { select: { id: true, full_name: true } },
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects.map((project) => {
      return {
        ...project,
        template_type: project.template.type,
        current_step_name: project.current_step?.name || null,
        current_step_order: project.current_step?.order || null,
        assignee_id:
          project.template.type === UnitResponsibleType.CONTRACT
            ? project.assignee_contract?.id || null
            : project.assignee_procurement?.id || null,
        assignee_full_name:
          project.template.type === UnitResponsibleType.CONTRACT
            ? project.assignee_contract?.full_name || null
            : project.assignee_procurement?.full_name || null,
        template: undefined,
        current_step: undefined,
        assignee_procurement: undefined,
        assignee_contract: undefined,
      };
    }),
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

export const changeAssignee = async (data: UpdateStatusProjectDto) => {
  const { id, userId } = data;
  if (!userId) {
    throw new BadRequestError('No new assignee ID provided for update');
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      template: {
        select: {
          type: true,
        },
      },
    },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (
    project.status !== ProjectStatus.PROCUREMENT_WAITING_ACCEPTANCE &&
    project.status !== ProjectStatus.CONTRACT_WAITING_ACCEPTANCE
  ) {
    throw new BadRequestError(
      'Assignee can only be changed when project is in WAITING_ACCEPTANCE status'
    );
  }
  const { assigneeField } = checkProjectStatusToAssign(project);

  return await prisma.$transaction(async (tx) => {
    const oldAssignee = (project as any)[assigneeField];
    await UserService.getById(userId);

    const updated = await tx.project.update({
      where: { id },
      data: {
        [assigneeField]: userId,
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { assignee: oldAssignee },
        new_value: { assignee: userId },
        changed_by: 'system',
      },
    });
    return { data: updated };
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
