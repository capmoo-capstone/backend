import { prisma } from '../config/prisma';
import { Department } from '@prisma/client';
import { NotFoundError } from '../lib/errors';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from '../schemas/department.schema';
import { AuthPayload } from '../types/auth.type';
import { DepartmentsListResponse } from '../types/department.type';

export const listDepartments = async (
  _user: AuthPayload
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
  return await prisma.department.create({
    data: {
      id: data.id,
      name: data.name,
    },
  });
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
