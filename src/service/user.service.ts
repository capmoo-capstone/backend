import { prisma } from '../config/prisma';
import { Prisma, User, UserRole } from '@prisma/client';
import {
  CreateUserDto,
  UsersListFilters,
  UsersListResponse,
} from '../models/User';
import { BadRequestError, NotFoundError } from '../lib/errors';

export const listUsers = async (
  filters: UsersListFilters
): Promise<Partial<UsersListResponse>> => {
  const { unitId, deptId } = filters;

  const where: Prisma.UserWhereInput = {};
  let data: Partial<UsersListResponse> = {};

  if (unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, dept_id: deptId },
      select: { id: true, name: true },
    });
    if (!unit) {
      throw new NotFoundError('Unit not found');
    }
    where.unit_id = unitId;
    data = {
      id: unit.id,
      entity_type: 'unit',
      name: unit.name,
    };
  } else if (deptId) {
    const department = await prisma.department.findUnique({
      where: { id: deptId },
      select: { id: true, name: true },
    });
    if (!department) {
      throw new NotFoundError('Department not found');
    }
    where.dept_id = deptId;
    data = {
      id: department.id,
      entity_type: 'department',
      name: department.name,
    };
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      orderBy: { id: 'desc' },
      where,
      select: {
        id: true,
        full_name: true,
        role: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    ...data,
    total,
    data: users,
  };
};

const getByUsername = async (username: string): Promise<User | null> => {
  return await prisma.user.findUnique({
    where: { username },
  });
};

export const getById = async (id: string): Promise<any> => {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return { data: user };
};

export const updateRole = async (id: string, role: UserRole): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: {
        id: true,
        dept_id: true,
      },
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (user.dept_id) {
      const allowedRole = await tx.allowedRole.findFirst({
        where: {
          dept_id: user.dept_id,
          role,
        },
      });

      if (!allowedRole) {
        throw new BadRequestError(
          'The specified role is not allowed for this department'
        );
      }
    }

    const updated = await tx.user.update({
      where: { id },
      data: { role },
      select: { id: true, full_name: true, role: true },
    });

    return { data: updated };
  });
};

): Promise<any> => {
  });
};

  });
};

export const deleteUser = async (id: string): Promise<void> => {
  await getById(id);
  await prisma.user.delete({
    where: { id },
  });
};

export const updateUser = async (
  id: string,
  updateData: Partial<CreateUserDto>
): Promise<any> => {
  await getById(id);
  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
  });
  return { data: updated };
};
