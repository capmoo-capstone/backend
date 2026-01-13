import { prisma } from '../config/prisma';
import { Project } from '../../generated/prisma/client';
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

export const getUnassignedProjects = async (): Promise<Project[]> => {
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { assignee_procurement_id: null },
        { status: 'WAITING_TO_BE_ASSIGNED' },
      ],
    },
    orderBy: [{ is_urgent: 'desc' }, { created_at: 'asc' }],
  });

  return projects;
};

export const assignProjectToUser = async (
  type: 'procurement' | 'contract',
  projectId: string,
  userId: string
) => {
  if (type === 'contract') {
    return await prisma.project.update({
      where: { id: projectId },
      data: {
        assignee_contract_id: userId,
        status: 'WAITING_FOR_ACCEPTANCE',
      },
    });
  } else if (type === 'procurement') {
    return await prisma.project.update({
      where: { id: projectId },
      data: {
        assignee_procurement_id: userId,
        status: 'WAITING_FOR_ACCEPTANCE',
      },
    });
  }
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

  if (action === 'CLAIM' && project?.status === 'WAITING_TO_BE_ASSIGNED') {
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

export const rejectProject = async (projectId: string, userId: string) => {
  const project = await getById(projectId);
  if (
    project?.assignee_procurement_id !== userId &&
    project?.assignee_contract_id !== userId
  ) {
    throw new BadRequestError(
      'Project not assigned to this user or does not exist'
    );
  }
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      assignee_procurement_id: null,
      assignee_contract_id: null,
      status: 'WAITING_TO_BE_ASSIGNED',
    },
  });
};

export const updateProjectData = async (
  projectId: string,
  updateData: Partial<CreateProjectDto>
) => {
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      ...updateData,
    },
  });
};
