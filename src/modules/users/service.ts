import { prisma } from '../../lib/prisma';
import { User } from '../../../generated/prisma/client';
import { CreateUserDto } from './model';

export const createUser = async (userData: CreateUserDto): Promise<User> => {
  return await prisma.user.create({
    data: {
      username: userData.username,
      full_name: userData.full_name,
      email: userData.email ?? undefined,
      role: userData.role ?? undefined,
      unit_id: userData.unit_id ?? undefined,
    },
  });
};

export const listUsers = async (): Promise<User[]> => {
  return await prisma.user.findMany();
};
