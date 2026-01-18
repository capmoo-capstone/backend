import { prisma } from '../config/prisma';
import { Project, ProjectStatus } from '../../generated/prisma/client';
import {
  CreateProjectDto,
  PaginatedProjects,
  UpdateStatusProjectDto,
} from '../models/Project';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import { get } from 'node:http';

export const listProjects = async (
  page: number,
  limit: number
): Promise<any> => {
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
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  return project;
};

export const getUnassignedProjects = async (
  page: number,
  limit: number,
  projectType: 'procurement' | 'contract'
): Promise<PaginatedProjects> => {
  const where: any = {
    status: ProjectStatus.UNASSIGNED,
    assignee_contract_id: null,
    assignee_procurement_id: { not: null },
  };

  if (projectType === 'procurement') {
    where.assignee_procurement_id = null;
  }

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

export const assignProjectToUser = async (data: UpdateStatusProjectDto) => {
  const { projectType, projectId, userId } = data;
  const project = await getById(projectId);
  const assigneeField =
    projectType === 'contract'
      ? 'assignee_contract_id'
      : 'assignee_procurement_id';

  if (project?.[assigneeField] !== null) {
    throw new BadRequestError('Project is already assigned');
  }
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      [assigneeField]: userId,
      status: 'WAITING_FOR_ACCEPTANCE',
    },
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

export const acceptProject = async (data: UpdateStatusProjectDto) => {
  const { projectType, projectId, userId } = data;
  const project = await getById(projectId);

  const isContract = projectType === 'contract';
  const assigneeField = isContract
    ? 'assignee_contract_id'
    : 'assignee_procurement_id';
  const nextStatus = isContract
    ? 'IN_PROGRESS_OF_CONTRACT'
    : 'IN_PROGRESS_OF_PROCUREMENT';

  if (project?.status === 'WAITING_FOR_ACCEPTANCE') {
    if (project[assigneeField] === userId) {
      return await prisma.project.update({
        where: { id: projectId },
        data: {
          status: nextStatus,
        },
      });
    }
    throw new BadRequestError('Project is not assigned to this user');
  }
  throw new BadRequestError('This project cannot be accepted right now');
};

export const rejectProject = async (data: UpdateStatusProjectDto) => {
  const { projectType, projectId, userId } = data;
  const project = await getById(projectId);
  const assigneeField =
    projectType === 'contract'
      ? 'assignee_contract_id'
      : 'assignee_procurement_id';
  if (project?.[assigneeField] !== userId) {
    throw new BadRequestError('Project not assigned to this user');
  }
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      [assigneeField]: null,
      status: 'UNASSIGNED',
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
