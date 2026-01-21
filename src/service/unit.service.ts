import { prisma } from '../config/prisma';
import { Unit, User, UserRole } from '../../generated/prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import {
  CreateUnitDto,
  UpdateUserUnitDto,
  PaginatedUnits,
  UpdateUnitDto,
  UpdateRepresentativeUnitDto,
} from '../models/Unit';

export const listUnits = async (
  page: number,
  limit: number
): Promise<PaginatedUnits> => {
  const skip = (page - 1) * limit;

  const [units, total] = await prisma.$transaction([
    prisma.unit.findMany({
      skip: skip,
      take: limit,
      orderBy: { id: 'desc' },
    }),
    prisma.unit.count(),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: units,
  };
};

export const getById = async (id: string): Promise<Unit> => {
  const unit = await prisma.unit.findUnique({
    where: { id },
  });
  if (!unit) {
    throw new NotFoundError('Unit not found');
  }
  return unit;
};

export const createUnit = async (data: CreateUnitDto): Promise<Unit> => {
  const unit = await prisma.unit.create({
    data: {
      name: data.name,
      type: data.type,
      dept_id: data.dept_id,
    },
  });
  if (!unit) {
    throw new AppError('Failed to create unit', 500);
  }
  return unit;
};

export const addUsersToUnit = async (data: UpdateUserUnitDto): Promise<any> => {
  const unitId = data.unit_id;
  let count = 0;
  return await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: {
        id: {
          in: data.user_id,
        },
      },
    });

    if (users.length !== data.user_id.length) {
      throw new NotFoundError('User not found');
    }

    const result = await tx.user.updateMany({
      where: {
        id: {
          in: data.user_id,
        },
      },
      data: { unit_id: unitId },
    });

    count = result.count;

    return { count: `${count} users added to the unit successfully.` };
  });
};

export const addRepresentativeToUnit = async (
  data: UpdateRepresentativeUnitDto
): Promise<User> => {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: data.user_id },
      select: {
        id: true,
        dept_id: true,
      },
    });

    if (!user || !user.dept_id) {
      throw new NotFoundError('User not found');
    }

    const allowedRole = await tx.allowedRole.findFirst({
      where: {
        dept_id: user.dept_id,
        role: UserRole.REPRESENTATIVE,
      },
    });

    if (!allowedRole) {
      throw new BadRequestError(
        'Cannot assign representative role to this user'
      );
    }

    return await tx.user.update({
      where: { id: data.user_id },
      data: { role: UserRole.REPRESENTATIVE },
    });
  });
};

export const updateUnit = async (data: UpdateUnitDto): Promise<Unit> => {
  await getById(data.id);
  return await prisma.unit.update({
    where: { id: data.id },
    data: { ...data },
  });
};

export const deleteUnit = async (id: string): Promise<Unit> => {
  await getById(id);
  return await prisma.unit.delete({
    where: { id },
  });
};
