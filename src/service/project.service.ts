import { prisma } from '../config/prisma';
import {
  Project,
  ProjectStatus,
  UnitResponsibleType,
} from '../../generated/prisma/client';
import {
  CreateProjectDto,
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

export const assignProjectsToUser = async (data: UpdateStatusProjectsDto) => {
  return await prisma.$transaction(async (tx) => {
    const updatedProjects = [];

    for (const item of data) {
      const { projectId, userId } = item;

      // NOTE: Use 'tx' instead of 'prisma' or 'getById' inside the loop
      // to ensure lookups happen within the same transaction context
      const project = await getById(projectId);

      if (!project) {
        throw new BadRequestError(`Project ${projectId} not found`);
      }

      await UserService.getById(userId); // Ensure user exists

      const isContract =
        project.template?.type === UnitResponsibleType.CONTRACT;
      const assigneeField = isContract
        ? 'assignee_contract_id'
        : 'assignee_procurement_id';

      // Validation
      if (
        project.status !== ProjectStatus.PROCUREMENT_UNASSIGNED &&
        project.status !== ProjectStatus.CONTRACT_UNASSIGNED
      ) {
        throw new BadRequestError(`Project ${projectId} is not unassigned`);
      }

      if (project[assigneeField] !== null) {
        throw new BadRequestError(`Project ${projectId} is already assigned`);
      }

      const nextStatus = isContract
        ? [
            ProjectStatus.CONTRACT_UNASSIGNED,
            ProjectStatus.CONTRACT_WAITING_ACCEPTANCE,
          ]
        : [
            ProjectStatus.PROCUREMENT_UNASSIGNED,
            ProjectStatus.PROCUREMENT_WAITING_ACCEPTANCE,
          ];

      // 2. Perform the update using the transaction client 'tx'
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
      });

      updatedProjects.push(updated);
    }

    return updatedProjects;
    // If the loop finishes, Prisma commits everything.
    // If any error is thrown here, Prisma rolls back everything automatically.
  });
};

export const claimProject = async (data: UpdateStatusProjectDto) => {
  const { projectType, projectId, userId } = data;
  const project = await getById(projectId);

  const isContract = projectType === 'contract';
  const assigneeField = isContract
    ? 'assignee_contract_id'
    : 'assignee_procurement_id';
  const nextStatus = isContract
    ? 'IN_PROGRESS_OF_CONTRACT'
    : 'IN_PROGRESS_OF_PROCUREMENT';

  if (project?.status === 'UNASSIGNED') {
    return await prisma.project.update({
      where: { id: projectId },
      data: {
        [assigneeField]: userId,
        status: nextStatus,
      },
    });
  }
  throw new BadRequestError('This project cannot be claimed right now');
};

export const acceptProjects = async (data: UpdateStatusProjectsDto) => {
  data.forEach(async (item) => {
    const { projectType, projectId, userId } = item;
    const project = await getById(projectId);

    const isContract = projectType === 'contract';
    const assigneeField = isContract
      ? 'assignee_contract_id'
      : 'assignee_procurement_id';
    const nextStatus = isContract
      ? 'IN_PROGRESS_OF_CONTRACT'
      : 'IN_PROGRESS_OF_PROCUREMENT';

    if (project?.status !== ProjectStatus.WAITING_FOR_ACCEPTANCE) {
      throw new BadRequestError('Project is not waiting for acceptance');
    }
    if (project?.[assigneeField] !== userId) {
      throw new BadRequestError('You are not assigned to this project');
    }

    const updated = await prisma.project.update({
      where: {
        id: projectId,
        status: ProjectStatus.WAITING_FOR_ACCEPTANCE,
        [assigneeField]: userId,
      },
      data: {
        status: nextStatus,
      },
    });

    if (!updated) {
      throw new AppError('Project cannot be accepted at this time', 500);
    }
  });
};

export const cancelProject = async (projectId: string) => {
  await getById(projectId);
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.REJECTED,
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
