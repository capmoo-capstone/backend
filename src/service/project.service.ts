import { prisma } from '../config/prisma';
import { Project } from '../../generated/prisma/client';

type ProjectListResponse = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Project[];
};

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
    data: projects,
  };
};
