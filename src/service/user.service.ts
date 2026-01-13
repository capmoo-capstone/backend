import { prisma } from '../config/prisma';
import { User } from '../../generated/prisma/client';
import { CreateUserDto, UserListResponse } from '../models/User';

export const createUser = async (userData: CreateUserDto): Promise<User> => {
  return await prisma.user.create({
    data: userData,
  });
};

export const listUsers = async (
  page: number,
  limit: number
): Promise<UserListResponse> => {
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
