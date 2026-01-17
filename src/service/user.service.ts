import { prisma } from '../config/prisma';
import { User } from '../../generated/prisma/client';
import { CreateUserDto } from '../models/User';
import { AppError, NotFoundError } from '../lib/errors';

export const createUser = async (userData: CreateUserDto): Promise<User> => {
  const existingUser = await findUserByUsername(userData.username);
  if (existingUser) {
    throw new AppError('Username already exists', 409);
  }
  return await prisma.user.create({
    data: userData,
  });
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
export const findUserByUsername = async (
  username: string
): Promise<User | null> => {
  return await prisma.user.findUnique({
    where: { username },
  });
};

export const findUserById = async (id: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
};

export const updateUser = async (
  id: string,
  updateData: Partial<CreateUserDto>
): Promise<User> => {
  return await prisma.user.update({
    where: { id },
    data: updateData,
  });
};
