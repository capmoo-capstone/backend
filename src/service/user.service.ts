import { prisma } from '../config/prisma';
import { User, UserRole } from '../../generated/prisma/client';
import { CreateUserDto } from '../models/User';
import { AppError, NotFoundError } from '../lib/errors';

export const createUser = async (userData: CreateUserDto): Promise<User> => {
  const existingUser = await getByUsername(userData.username);
  if (existingUser) {
    throw new AppError('Username already exists', 409);
  }
  const user = await prisma.user.create({
    data: userData,
  });
  if (!user) {
    throw new AppError('Failed to create user', 500);
  }
  return user;
};

export const listUsers = async (page: number, limit: number): Promise<any> => {
  const skip = (page - 1) * limit;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip: skip,
      take: limit,
      orderBy: { id: 'desc' },
    }),
    prisma.user.count(),
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
  await getById(id);
  return await prisma.user.update({
    where: { id },
    data: { role },
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
      is_delegate: true,
      delegate_user_id: delegateUserId,
    },
  });
};

export const revokeDelegate = async (id: string): Promise<User> => {
  await getById(id);
  return await prisma.user.update({
    where: { id },
    data: {
      is_delegate: false,
      delegate_user_id: null,
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
