import { prisma } from '../config/prisma';
import { NotFoundError } from '../lib/errors';
import { AddDelegationDto } from '../models/Delegation';
import * as UserService from './user.service';

export const addDelegation = async (data: AddDelegationDto): Promise<any> => {
  await Promise.all([
    UserService.getById(data.delegator_id),
    UserService.getById(data.delegatee_id),
  ]);
  const created = await prisma.userDelegation.create({
    data: {
      delegator_id: data.delegator_id,
      delegatee_id: data.delegatee_id,
      start_date: data.start_date,
      end_date: data.end_date ?? undefined,
      is_active: true,
    },
  });
  return { data: created };
};

export const cancelDelegation = async (id: string): Promise<any> => {
  const updated = await prisma.userDelegation.update({
    where: { id },
    data: {
      is_active: false,
    },
  });
  return { data: updated };
};

export const getById = async (id: string): Promise<any> => {
  const delegation = await prisma.userDelegation.findUnique({
    where: { id },
    include: {
      delegator: {
        select: {
          id: true,
          full_name: true,
          roles: {
            select: {
              role: { select: { name: true } },
              dept_id: true,
              unit_id: true,
            },
          },
        },
      },
      delegatee: {
        select: {
          id: true,
          full_name: true,
          roles: {
            select: {
              role: { select: { name: true } },
              dept_id: true,
              unit_id: true,
            },
          },
        },
      },
    },
  });

  if (!delegation) {
    throw new NotFoundError('Delegation not found');
  }

  return { data: delegation };
};
