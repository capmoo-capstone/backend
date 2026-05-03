import { prisma } from '../config/prisma';
import { Unit, UnitResponsibleType, UserRole } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../lib/errors';
import {
  CreateUnitDto,
  UpdateUnitDto,
  UpdateUnitUsersDto,
  UpdateRepresentativeDto,
} from '../schemas/unit.schema';
import { PaginatedUnits, UnitRepresentativeResponse } from '../types/unit.type';
import { OPS_DEPT_ID } from '../lib/constant';
import {
  addRoleInternal,
  assertNoDuplicatesOrOverlap,
  assertUsersExist,
  removeRoleInternal,
} from '../lib/user-role';

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

const checkValidateType = async (
  id: string,
  type: UnitResponsibleType[]
): Promise<boolean> => {
  return !!(await prisma.unit.findFirst({
    where: {
      id: { not: id },
      type: {
        hasSome: type,
      },
    },
  }));
};

export const createUnit = async (data: CreateUnitDto): Promise<Unit> => {
  if (data.type && (await checkValidateType(data.id, data.type))) {
    throw new BadRequestError('Unit with the same type already exists');
  }
  return await prisma.unit.create({
    data: {
      id: data.id,
      name: data.name,
      type: data.type,
      dept_id: data.dept_id,
    },
  });
};

export const updateUnit = async (data: UpdateUnitDto): Promise<Unit> => {
  await getById(data.id);
  if (data.type && (await checkValidateType(data.id, data.type))) {
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

export const getRepresentative = async (
  id: string
): Promise<UnitRepresentativeResponse | null> => {
  await getById(id);

  const representative = await prisma.userOrganizationRole.findFirst({
    where: { unit_id: id, role: UserRole.REPRESENTATIVE },
    select: {
      user: {
        select: {
          id: true,
          full_name: true,
        },
      },
    },
  });

  return representative
    ? {
        id: representative.user.id,
        full_name: representative.user.full_name,
        unit_id: id,
      }
    : null;
};

export const updateUnitUsers = async (
  data: UpdateUnitUsersDto
): Promise<{ added: number; removed: number }> => {
  const { unit_id, new_users, remove_users } = data;

  if (new_users.length === 0 && remove_users.length === 0) {
    throw new BadRequestError('No users to add or remove');
  }

  assertNoDuplicatesOrOverlap(new_users, remove_users);

  return await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: unit_id },
      select: { id: true, dept_id: true },
    });
    if (!unit) throw new NotFoundError('Unit not found');
    if (unit.dept_id !== OPS_DEPT_ID) {
      throw new BadRequestError(
        'This endpoint is only for units under the Supply department'
      );
    }

    await assertUsersExist(tx, [...new_users, ...remove_users]);

    // ADD — ตรวจว่า user อยู่ใน OPS dept อยู่แล้ว
    for (const userId of new_users) {
      const inOpsDept = await tx.userOrganizationRole.findFirst({
        where: { user_id: userId, dept_id: OPS_DEPT_ID },
      });
      if (!inOpsDept) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { full_name: true },
        });
        throw new BadRequestError(
          `User ${user?.full_name} cannot be assigned to Supply Operation units`
        );
      }

      await addRoleInternal(tx, {
        userId,
        role: UserRole.GENERAL_STAFF,
        deptId: OPS_DEPT_ID,
        unitId: unit_id,
      });
    }

    // REMOVE
    for (const userId of remove_users) {
      await removeRoleInternal(tx, {
        userId,
        role: UserRole.GENERAL_STAFF,
        deptId: OPS_DEPT_ID,
        unitId: unit_id,
      });
    }

    return { added: new_users.length, removed: remove_users.length };
  });
};

export const updateRepresentative = async (
  data: UpdateRepresentativeDto
): Promise<{ added: number; removed: number }> => {
  const { unit_id, new_users, remove_users } = data;

  if (new_users.length === 0 && remove_users.length === 0) {
    throw new BadRequestError('No users to add or remove');
  }

  assertNoDuplicatesOrOverlap(new_users, remove_users);

  return await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: unit_id },
      select: { id: true, department: { select: { id: true } } },
    });
    if (!unit) throw new NotFoundError('Unit not found');
    if (unit.department.id === OPS_DEPT_ID) {
      throw new BadRequestError(
        'Representative role is not allowed for Supply units'
      );
    }

    await assertUsersExist(tx, [...new_users, ...remove_users]);

    // ตรวจว่าถ้าจะ add ใหม่ และ unit มี REPRESENTATIVE อยู่แล้ว
    // (ที่ไม่ใช่คนที่กำลังจะ remove) → throw error
    if (new_users.length > 0) {
      const existingRep = await tx.userOrganizationRole.findFirst({
        where: {
          unit_id,
          role: UserRole.REPRESENTATIVE,
          user_id: { notIn: remove_users },
        },
        select: { user_id: true },
      });
      if (existingRep) {
        throw new BadRequestError(
          'Unit already has a representative. Include them in remove_users to replace.'
        );
      }
    }

    // REMOVE
    for (const userId of remove_users) {
      await removeRoleInternal(tx, {
        userId,
        role: UserRole.REPRESENTATIVE,
        deptId: unit.department.id,
        unitId: unit_id,
      });
    }

    // ADD
    for (const userId of new_users) {
      await addRoleInternal(tx, {
        userId,
        role: UserRole.REPRESENTATIVE,
        deptId: unit.department.id,
        unitId: unit_id,
      });
    }

    return { added: new_users.length, removed: remove_users.length };
  });
};
