import { prisma } from '../config/prisma';
import {
  Project,
  ProjectStatus,
  UnitResponsibleType,
} from '../../generated/prisma/client';
import {
  CreateProjectDto,
  LogProjectStatusChangeDto,
  PaginatedProjects,
  UpdateStatusProjectDto,
  UpdateStatusProjectsDto,
} from '../models/Project';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import * as UserService from './user.service';
import * as UnitService from './unit.service';
import { get } from 'node:http';

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

const getReceiveNumber = async (): Promise<number> => {
  const count = await prisma.project.count();
  return count + 1;
};

export const createProject = async (
  projectData: CreateProjectDto
): Promise<Project> => {
  const project = await prisma.project.create({
    data: {
      receive_no: await getReceiveNumber().then((num) => num.toString()),
      ...projectData,
    },
  });
  if (!project) {
    throw new AppError('Failed to create project', 500);
  }
  return project;
};

export const getById = async (id: string): Promise<Project | null> => {
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
      const { projectId, userId } = item;

      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: {
          template: true,
        },
      });

      if (!project) {
        throw new BadRequestError(`Project ${projectId} not found`);
      }
      const { assigneeField, nextStatus } = checkProjectStatusToAssign(project);
      await UserService.getById(userId);

      if (project.status !== nextStatus[0]) {
        throw new BadRequestError(`Project ${projectId} is not unassigned`);
      }
      if ((project as any)[assigneeField] !== null) {
        throw new BadRequestError(`Project ${projectId} is already assigned`);
      }

      const updated = await tx.project.update({
        where: {
          id: projectId,
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
    }

    return { data: updatedProjects };
  });
};

export const claimProject = async (data: UpdateStatusProjectDto) => {
  const { projectId, userId } = data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
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

  const updated = await prisma.project.update({
    where: {
      id: projectId,
      status: nextStatus[0],
      [assigneeField]: null,
    },
    data: {
      [assigneeField]: userId,
      status: nextStatus[2],
    },
    select: { id: true, status: true, [assigneeField]: true },
  });

  return { data: updated };
};

export const acceptProjects = async (data: UpdateStatusProjectsDto) => {
  return await prisma.$transaction(async (tx) => {
    const updatedProjects = [];
    for (const item of data) {
      const { projectId, userId } = item;
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: {
          template: true,
        },
      });
      if (!project) {
        throw new NotFoundError(`Project ${projectId} not found`);
      }
      const { assigneeField, nextStatus } = checkProjectStatusToAssign(project);
      if (project?.status !== nextStatus[1]) {
        throw new BadRequestError(
          `Project ${projectId} is not waiting for acceptance`
        );
      }
      if ((project as any)[assigneeField] !== userId) {
        throw new BadRequestError(
          `You are not assigned to project ${projectId}`
        );
      }
      const updated = await tx.project.update({
        where: {
          id: projectId,
          status: nextStatus[1],
          [assigneeField]: userId,
        },
        data: {
          status: nextStatus[2],
        },
        select: { id: true, status: true, [assigneeField]: true },
      });
      updatedProjects.push(updated);
    }
    return { data: updatedProjects };
  });
};

export const cancelProject = async (id: string) => {
  await getById(id);
  return await prisma.project.update({
    where: { id },
    data: {
      status: ProjectStatus.CANCELLED,
    },
  });
};

export const updateProjectData = async (
  projectId: string,
  updateData: Partial<CreateProjectDto>
) => {
  if (!updateData || Object.keys(updateData).length === 0) {
    throw new BadRequestError('No data provided for update');
  }
  await getById(projectId);
  return await prisma.project.update({
    where: { id: projectId },
    data: { ...updateData },
  });
};

export const deleteProject = async (id: string): Promise<void> => {
  await getById(id);
  await prisma.project.delete({
    where: { id },
  });
};
