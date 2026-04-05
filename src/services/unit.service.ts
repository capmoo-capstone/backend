import { prisma } from '../config/prisma';
import { Unit, UnitResponsibleType, UserRole } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import {
  CreateUnitDto,
  UpdateUnitDto,
  UpdateUnitUsersDto,
} from '../schemas/unit.schema';
import { PaginatedUnits, UpdateUnitUsersResponse } from '../types/unit.type';
import { OPS_DEPT_ID } from '../lib/constant';
import { upsertUserRoleInternal } from '../lib/user-role';

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

export const updateUnitUsers = async (
  data: UpdateUnitUsersDto
): Promise<UpdateUnitUsersResponse> => {
  const newUsers = data.new_users ?? [];
  const removeUsers = data.remove_users ?? [];

  if (newUsers.length === 0 && removeUsers.length === 0) {
    throw new BadRequestError('No users to add or remove');
  }

  if (
    new Set(newUsers).size !== newUsers.length ||
    new Set(removeUsers).size !== removeUsers.length
  ) {
    throw new BadRequestError('Duplicate user IDs are not allowed');
  }

  const duplicateUsers = new Set(
    newUsers.filter((id) => removeUsers.includes(id))
  );

  if (duplicateUsers.size > 0) {
    throw new BadRequestError(
      'The same user cannot be added and removed in one request'
    );
  }

  return await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: data.id },
      select: { id: true, dept_id: true },
    });
    if (!unit) throw new NotFoundError('Unit not found');
    if (unit.dept_id !== OPS_DEPT_ID) {
      throw new BadRequestError(
        'This endpoint is only for units under the Supply department'
      );
    }

    const allUsers = [...newUsers, ...removeUsers];
    const usersCount = await tx.user.count({
      where: { id: { in: allUsers } },
    });

    if (usersCount !== allUsers.length) {
      throw new NotFoundError('One or more users not found');
    }

    for (const id of newUsers) {
      const user = await tx.user.findUnique({
        where: { id },
        select: {
          full_name: true,
          roles: { select: { dept_id: true } },
        },
      });

      if (!user) {
        throw new NotFoundError('One or more users not found');
      }

      if (user.roles.some((r: any) => r.dept_id === OPS_DEPT_ID)) {
        await upsertUserRoleInternal(tx, {
          userId: id,
          role: UserRole.GENERAL_STAFF,
          deptId: OPS_DEPT_ID,
          unitId: unit.id,
        });
      } else {
        throw new BadRequestError(
          `User ${user.full_name} cannot be assigned to Supply Operation units`
        );
      }
    }

    if (removeUsers.length > 0) {
      await tx.userOrganizationRole.updateMany({
        where: {
          user_id: { in: removeUsers },
          dept_id: OPS_DEPT_ID,
          unit_id: unit.id,
        },
        data: { unit_id: null },
      });

      await tx.user.updateMany({
        where: { id: { in: removeUsers } },
        data: { role_updated_at: new Date() },
      });
    }

    return {
      count: newUsers.length + removeUsers.length,
      message: `${newUsers.length} users added and ${removeUsers.length} users removed for Supply unit ${data.id} successfully.`,
    };
  });
};
