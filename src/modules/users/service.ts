import { prisma } from '../../lib/prisma';
import { CreateUserInput } from './model';

export const createUser = async (data: CreateUserInput) => {
  return await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
    },
  });
};

export const getAllUsers = async () => {
  return await prisma.user.findMany();
};
