import { prisma } from '../config/prisma';
import { Unit, UnitResponsibleType } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import { CreateUnitDto, PaginatedUnits, UpdateUnitDto } from '../models/Unit';

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

const checkValidateType = async (type: UnitResponsibleType[]) => {
  return await prisma.unit.findFirst({
    where: {
      type: {
        hasSome: type,
      },
    },
  });
}

export const createUnit = async (data: CreateUnitDto): Promise<Unit> => {
  if (data.type && await checkValidateType(data.type)) {
    throw new BadRequestError('Unit with the same type already exists');
  }
  const unit = await prisma.unit.create({
    data: {
      id: data.id,
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

export const updateUnit = async (data: UpdateUnitDto): Promise<Unit> => {
  await getById(data.id);
  if (data.type && await checkValidateType(data.type)) {
    throw new BadRequestError('Unit with the same type already exists');
  }
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
