import { prisma } from '../config/prisma';
import { Department } from '@prisma/client';
import { AppError, NotFoundError } from '../lib/errors';
import {
  CreateDepartmentDto,
  DepartmentsListResponse,
  UpdateDepartmentDto,
} from '../models/Department';
import { AuthPayload } from '../lib/types';

export const listDepartments = async (
  user: AuthPayload
): Promise<DepartmentsListResponse> => {
  const [departments, total] = await prisma.$transaction([
    prisma.department.findMany({
      include: {
        units: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.department.count(),
  ]);

  return {
    total,
    data: departments,
  };
};

export const getById = async (id: string): Promise<Department> => {
  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      units: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!department) {
    throw new NotFoundError('Department not found');
  }
  return department;
};

export const createDepartment = async (
  data: CreateDepartmentDto
): Promise<Department> => {
  const department = await prisma.department.create({
    data: {
      id: data.id,
      name: data.name,
    },
  });
  if (!department) {
    throw new AppError('Failed to create department', 500);
  }
  return department;
};

export const updateDepartment = async (
  data: UpdateDepartmentDto
): Promise<Department> => {
  await getById(data.id);
  return await prisma.department.update({
    where: { id: data.id },
    data: { ...data },
  });
};

export const deleteDepartment = async (id: string): Promise<Department> => {
  await getById(id);
  return await prisma.department.delete({
    where: { id },
  });
};
