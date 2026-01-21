import { prisma } from '../config/prisma';
import { Department, UserRole } from '../../generated/prisma/client';
import { AppError, NotFoundError } from '../lib/errors';
import {
  CreateDepartmentDto,
  PaginatedDepartments,
  UpdateDepartmentDto,
} from '../models/Department';

export const listDepartments = async (
  page: number,
  limit: number
): Promise<PaginatedDepartments> => {
  const skip = (page - 1) * limit;

  const [departments, total] = await prisma.$transaction([
    prisma.department.findMany({
      skip: skip,
      take: limit,
      orderBy: { id: 'desc' },
    }),
    prisma.department.count(),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: departments,
  };
};

export const getById = async (id: string): Promise<Department> => {
  const department = await prisma.department.findUnique({
    where: { id },
  });
  if (!department) {
    throw new NotFoundError('Department not found');
  }
  return department;
};

export const createDepartment = async (
  data: CreateDepartmentDto
): Promise<Department> => {
  let roles: UserRole[] = [
    UserRole.HEAD_OF_DEPARTMENT,
    UserRole.HEAD_OF_UNIT,
    UserRole.ADMIN,
    UserRole.GENERAL_STAFF,
  ];

  if (data.allowed_role && data.allowed_role.length > 0) {
    data.allowed_role.map((role) => {
      if (!roles.includes(role)) {
        roles.push(role);
      }
    });
  }
  const department = await prisma.department.create({
    data: {
      name: data.name,
      code: data.code,
      allowed_role: {
        create: roles.map((role) => ({ role })),
      },
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
