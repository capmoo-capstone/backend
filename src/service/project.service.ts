import { prisma } from '../config/prisma';
import { Project, ProjectStatus } from '../../generated/prisma/client';
import { CreateProjectDto } from '../models/Project';
import { BadRequestError, NotFoundError } from '../lib/errors';

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
    data: projects.map((project) => ({
      ...project,
      budget: project.budget.toNumber(),
    })),
  };
};

export const getReceiveNumber = async (): Promise<number> => {
  const count = await prisma.project.count();
  return count + 1;
};

export const createProject = async (
  projectData: CreateProjectDto
): Promise<Project> => {
  return await prisma.project.create({
    data: {
      ...projectData,
    },
  });
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
  projectType: 'procurement' | 'contract'
): Promise<Project[]> => {
  const where: any = {
    status: ProjectStatus.UNASSIGNED,
    assignee_contract_id: null,
  };

  if (projectType === 'procurement') {
    where.assignee_procurement_id = null;
  }

  const projects = await prisma.project.findMany({
    where: where,
    orderBy: [{ is_urgent: 'desc' }, { created_at: 'asc' }],
  });

  return projects;
};

export const assignProjectToUser = async (
  type: 'procurement' | 'contract',
  projectId: string,
  userId: string
) => {
  const project = await getById(projectId);
  const assigneeField =
    type === 'contract' ? 'assignee_contract_id' : 'assignee_procurement_id';

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

export const acceptProject = async (
  // 'CONFIRM' = responding to a direct assignment
  // 'CLAIM' = picking up an unassigned project from the pool
  action: 'CONFIRM' | 'CLAIM',
  projectType: 'procurement' | 'contract',
  projectId: string,
  userId: string
) => {
  const project = await getById(projectId);

  const isContract = projectType === 'contract';
  const assigneeField = isContract
    ? 'assignee_contract_id'
    : 'assignee_procurement_id';
  const nextStatus = isContract
    ? 'IN_PROGRESS_OF_CONTRACT'
    : 'IN_PROGRESS_OF_PROCUREMENT';

  if (action === 'CLAIM' && project?.status === 'UNASSIGNED') {
    return await prisma.project.update({
      where: { id: projectId },
      data: {
        [assigneeField]: userId,
        status: nextStatus,
      },
    });
  } else if (
    action === 'CONFIRM' &&
    project?.status === 'WAITING_FOR_ACCEPTANCE'
  ) {
    if (project[assigneeField] === userId) {
      return await prisma.project.update({
        where: { id: projectId },
        data: {
          status: nextStatus,
        },
      });
    } else {
      throw new BadRequestError('Project not assigned to this user');
    }
  } else throw new BadRequestError('This project cannot be accepted right now');
};

export const rejectProject = async (
  projectType: 'procurement' | 'contract',
  projectId: string,
  userId: string
) => {
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
  return await prisma.project.update({
    where: { id: projectId },
    data: { ...updateData },
  });
};
