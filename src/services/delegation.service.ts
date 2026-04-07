import { UserDelegation, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../lib/errors';
import { AddDelegationDto } from '../schemas/delegation.schema';
import * as UserService from './user.service';
import { DelegationDetail } from '../types/delegation.type';

export const addDelegation = async (
  data: AddDelegationDto
): Promise<UserDelegation> => {
  await Promise.all([
    UserService.getById(data.delegator_id),
    UserService.getById(data.delegatee_id),
  ]);
  return await prisma.$transaction(async (tx) => {
    const created = await tx.userDelegation.create({
      data: {
        delegator_id: data.delegator_id,
        delegatee_id: data.delegatee_id,
        start_date: data.start_date,
        end_date: data.end_date ?? undefined,
        is_active: true,
      },
    });

    await tx.user.update({
      where: { id: data.delegatee_id },
      data: { role_updated_at: new Date() },
    });

    return created;
  });
};

export const cancelDelegation = async (id: string): Promise<UserDelegation> => {
  return await prisma.$transaction(async (tx) => {
    const delegation = await tx.userDelegation.findUnique({
      where: { id },
    });
    if (!delegation) {
      throw new NotFoundError('Delegation not found');
    }

    const updated = await tx.userDelegation.update({
      where: { id },
      data: {
        is_active: false,
      },
    });

    await tx.user.update({
      where: { id: updated.delegatee_id },
      data: { role_updated_at: new Date() },
    });
    return updated;
  });
};

export const getById = async (id: string): Promise<DelegationDetail> => {
  const delegation = await prisma.userDelegation.findUnique({
    where: { id },
    include: {
      delegator: {
        select: {
          id: true,
          full_name: true,
          roles: {
            select: {
              role: true,
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
              role: true,
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

  return delegation;
};

export const getActiveDelegationByUnit = async (
  unitId: string
): Promise<DelegationDetail | null> => {
  const delegation = await prisma.userDelegation.findFirst({
    where: {
      delegator: {
        roles: {
          some: {
            role: UserRole.HEAD_OF_UNIT,
            unit_id: unitId,
          },
        },
      },
      is_active: true,
      start_date: { lte: new Date() },
      OR: [{ end_date: { equals: null } }, { end_date: { gte: new Date() } }],
    },
    include: {
      delegator: {
        select: {
          id: true,
          full_name: true,
          roles: {
            select: {
              role: true,
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
              role: true,
              dept_id: true,
              unit_id: true,
            },
          },
        },
      },
    },
  });

  return delegation ?? null;
};
