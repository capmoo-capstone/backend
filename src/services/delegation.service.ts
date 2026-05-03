import { UserDelegation, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { AddDelegationDto } from '../schemas/delegation.schema';
import * as UserService from './user.service';
import { DelegationDetail } from '../types/delegation.type';
import { AuthPayload } from '../types/auth.type';

export const addDelegation = async (
  user: AuthPayload,
  data: AddDelegationDto
): Promise<UserDelegation> => {
  await Promise.all([
    UserService.getById(data.delegator_id),
    UserService.getById(data.delegatee_id),
  ]);
  return await prisma.$transaction(async (tx) => {
    const validExisting = await tx.userDelegation.findFirst({
      where: {
        delegator_id: data.delegator_id,
        is_active: true,
        OR: [{ end_date: { equals: null } }, { end_date: { gte: new Date() } }],
      },
    });
    if (validExisting) {
      throw new BadRequestError(
        'An active delegation already exists for this delegator.'
      );
    }
    const created = await tx.userDelegation.create({
      data: {
        delegator_id: data.delegator_id,
        delegatee_id: data.delegatee_id,
        start_date: data.start_date,
        end_date: data.end_date ?? undefined,
        is_active: true,
        created_by: user.id,
      },
    });

    await tx.user.update({
      where: { id: data.delegatee_id },
      data: { role_updated_at: new Date() },
    });

    return created;
  });
};

export const cancelDelegation = async (
  user: AuthPayload,
  id: string
): Promise<UserDelegation> => {
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
        cancelled_at: new Date(),
        cancelled_by: user.id,
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

export const getActiveDelegation = async (
  role: UserRole,
  unitId: string | null
): Promise<DelegationDetail | null> => {
  const delegation = await prisma.userDelegation.findFirst({
    where: {
      delegator: {
        roles: {
          some: {
            role,
            unit_id: unitId,
          },
        },
      },
      is_active: true,
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
