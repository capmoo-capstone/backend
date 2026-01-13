import { prisma } from '../config/prisma';
import { Project } from '../../generated/prisma/client';
import {
  CreateProjectDto,
  ProjectListResponse,
  ProjectResponse,
} from '../models/Project';

export const listProjects = async (
  page: number,
  limit: number
): Promise<ProjectListResponse> => {
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
  return await prisma.project.findUnique({
    where: { id },
  });
};

export const getUnassignedProjects = async (): Promise<ProjectResponse[]> => {
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { assignee_procurement_id: null },
        { status: 'WAITING_TO_BE_ASSIGNED' },
      ],
    },
    orderBy: [{ is_urgent: 'desc' }, { created_at: 'asc' }],
  });

  return projects.map((project) => ({
    ...project,
    budget: project.budget.toNumber(),
  }));
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

export const acceptProjectAssignment = async (
  type: 'procurement' | 'contract',
  projectId: string
) => {
  if (type === 'contract') {
    return await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'IN_PROGRESS_OF_CONTRACT',
      },
    });
  } else if (type === 'procurement') {
    return await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'IN_PROGRESS_OF_PROCUREMENT',
      },
    });
  }
};

export const rejectProjectAssignment = async (projectId: string) => {
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
