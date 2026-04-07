import { prisma } from '../config/prisma';
import { Unit, UnitResponsibleType, UserRole } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import {
  CreateUnitDto,
  UpdateUnitDto,
  UpdateUnitUsersDto,
  UpdateRepresentativeUnitDto,
} from '../schemas/unit.schema';
import { UpdateUserRoleResponse } from '../types/user.type';
import {
  PaginatedUnits,
  UnitRepresentativeResponse,
  UpdateUnitUsersResponse,
} from '../types/unit.type';
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

    const newUsersData = await tx.user.findMany({
      where: { id: { in: newUsers } },
      select: {
        id: true,
        full_name: true,
        roles: { select: { dept_id: true } },
      },
    });

    const newUsersDataById = new Map(
      newUsersData.map((user) => [user.id, user])
    );

    for (const id of newUsers) {
      const user = newUsersDataById.get(id);

      if (!user) {
        throw new NotFoundError(`User with ID ${id} not found`);
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
          role: UserRole.GENERAL_STAFF,
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

export const updateRepresentative = async (
  data: UpdateRepresentativeUnitDto
): Promise<UpdateUserRoleResponse> => {
  return await prisma.$transaction(async (tx) => {
    const existingRepresentatives = await tx.userOrganizationRole.findMany({
      where: { unit_id: data.id, role: UserRole.REPRESENTATIVE },
      select: { user_id: true },
    });

    const unit = await tx.unit.findUnique({
      where: { id: data.id },
      select: { id: true, department: { select: { id: true } } },
    });
    if (!unit) throw new NotFoundError('Unit not found');
    if (unit.department.id === OPS_DEPT_ID) {
      throw new BadRequestError(
        'Representative role is not allowed for SUPPLY units'
      );
    }

    const user = await tx.user.findUnique({
      where: { id: data.user_id },
      select: { id: true },
    });
    if (!user) throw new NotFoundError('User not found');

    if (existingRepresentatives.length > 0) {
      await tx.userOrganizationRole.updateMany({
        where: { unit_id: unit.id, role: UserRole.REPRESENTATIVE },
        data: { role: UserRole.GUEST },
      });

      const oldRepresentativeIds = [
        ...new Set(
          existingRepresentatives.map(
            (representative) => representative.user_id
          )
        ),
      ];

      if (oldRepresentativeIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: oldRepresentativeIds } },
          data: { role_updated_at: new Date() },
        });
      }
    }

    const result = await upsertUserRoleInternal(tx, {
      userId: data.user_id,
      role: UserRole.REPRESENTATIVE,
      deptId: unit.department.id,
      unitId: unit.id,
    });

    return result;
  });
};
