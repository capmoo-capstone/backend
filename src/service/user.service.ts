import { prisma } from '../config/prisma';
import { User, UserRole } from '../../generated/prisma/client';
import { CreateUserDto } from '../models/User';
import { BadRequestError, NotFoundError } from '../lib/errors';

export const listUsers = async (
  page: number,
  limit: number,
  deptId?: string,
  unitId?: string
): Promise<any> => {
  const skip = (page - 1) * limit;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where: { dept_id: deptId, unit_id: unitId },
      skip: skip,
      take: limit,
      orderBy: { id: 'desc' },
    }),
    prisma.user.count({ where: { dept_id: deptId, unit_id: unitId } }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: users,
  };
};

const getByUsername = async (username: string): Promise<User | null> => {
  return await prisma.user.findUnique({
    where: { username },
  });
};

export const getById = async (id: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
};

export const updateRole = async (id: string, role: UserRole): Promise<User> => {
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
    if (!user.dept_id) {
      throw new NotFoundError('User has no department assigned');
    }

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

    return await tx.user.update({
      where: { id },
      data: { role },
    });
  });
};

export const setUserDelegate = async (
  userId: string,
  delegateUserId: string
): Promise<User> => {
  await Promise.all([getById(userId), getById(delegateUserId)]);
  return await prisma.user.update({
    where: { id: userId },
    data: {
      is_delegating: true,
      delegated_user_id: delegateUserId,
    },
  });
};

export const revokeDelegate = async (id: string): Promise<User> => {
  await getById(id);
  return await prisma.user.update({
    where: { id },
    data: {
      is_delegating: false,
      delegated_user_id: null,
    },
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
): Promise<User> => {
  await getById(id);
  return await prisma.user.update({
    where: { id },
    data: updateData,
  });
};
