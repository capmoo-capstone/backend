import { prisma } from '../../lib/prisma';
import { User } from '../../../generated/prisma/client';
import { CreateUserDto, UserListResponse } from './model';

export const createUser = async (userData: CreateUserDto): Promise<User> => {
  return await prisma.user.create({
    data: userData,
  });
};

export const listUsers = async (): Promise<UserListResponse> => {
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany(),
    prisma.user.count(),
  ]);
  return { total, users };
};

export const findUserByUsername = async (
  username: string
): Promise<User | null> => {
  return await prisma.user.findUnique({
    where: { username },
  });
};
