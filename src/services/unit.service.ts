import { prisma } from '../config/prisma';
import { Prisma, Unit, UnitResponsibleType, UserRole } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../lib/errors';
import {
  CreateUnitDto,
  UpdateUnitDto,
  UpdateUnitUsersDto,
  UpdateRepresentativeDto,
} from '../schemas/unit.schema';
import {
  PaginatedUnits,
  UnitListItem,
  UnitListOptions,
  UnitRepresentativeResponse,
} from '../types/unit.type';
import { OPS_DEPT_ID } from '../lib/constant';
import {
  addRoleInternal,
  assertNoDuplicatesOrOverlap,
  assertUsersExist,
  removeRoleInternal,
} from '../lib/user-role';

export const listUnits = async (
  page: number,
  limit: number,
  options: UnitListOptions = {}
): Promise<PaginatedUnits> => {
  const skip = (page - 1) * limit;
  const where: Prisma.UnitWhereInput = options.deptId
    ? { dept_id: options.deptId }
    : {};
  const includeRoles =
    options.withUsers || options.withHead || options.withDelegations;
  const userSelect: Prisma.UserSelect = {
    id: true,
    full_name: true,
  };
  if (options.withDelegations) {
    userSelect.delegations_given = {
      where: {
        is_active: true,
        OR: [{ end_date: { equals: null } }, { end_date: { gte: new Date() } }],
      },
      select: {
        id: true,
        start_date: true,
        end_date: true,
        delegator: {
          select: {
            id: true,
            full_name: true,
          },
        },
        delegatee: {
          select: {
            id: true,
            full_name: true,
          },
        },
      },
    };
  }
  const include: Prisma.UnitInclude = includeRoles
    ? {
        organization_roles: {
          where: {
            role: {
              in: [
                ...(options.withUsers
                  ? [
                      UserRole.GENERAL_STAFF,
                      UserRole.REPRESENTATIVE,
                      UserRole.GUEST,
                    ]
                  : []),
                ...(options.withHead || options.withDelegations
                  ? [UserRole.HEAD_OF_UNIT]
                  : []),
              ],
            },
          },
          select: {
            role: true,
            user: {
              select: userSelect,
            },
          },
        },
      }
    : {};

  const [units, total] = await prisma.$transaction([
    prisma.unit.findMany({
      where,
      skip: skip,
      take: limit,
      orderBy: { id: 'desc' },
      include: includeRoles ? include : undefined,
    }),
    prisma.unit.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: units.map((unit) => {
      const unitWithRelations = unit as unknown as UnitListItem & {
        organization_roles?: {
          role: UserRole;
          user: {
            id: string;
            full_name: string;
            delegations_given?: {
              id: string;
              delegator: {
                id: string;
                full_name: string;
              };
              delegatee: {
                id: string;
                full_name: string;
              };
              start_date: Date;
              end_date: Date | null;
            }[];
          };
        }[];
      };
      const roles = includeRoles
        ? (unitWithRelations.organization_roles ?? [])
        : [];
      const data: UnitListItem = {
        id: unit.id,
        name: unit.name,
        dept_id: unit.dept_id,
        type: unit.type,
      };

      if (options.withUsers) {
        data.users = roles
          .filter((role) => role.role !== UserRole.HEAD_OF_UNIT)
          .map((role) => ({
            id: role.user.id,
            full_name: role.user.full_name,
            role: role.role,
          }));
      }

      if (options.withHead) {
        const head = roles.find((role) => role.role === UserRole.HEAD_OF_UNIT);
        data.head = head
          ? {
              id: head.user.id,
              full_name: head.user.full_name,
            }
          : null;
      }

      if (options.withDelegations) {
        data.delegations =
          roles
            .filter((role) => role.role === UserRole.HEAD_OF_UNIT)
            .filter((role) => role.user.delegations_given.length > 0)
            .flatMap((role) =>
              role.user.delegations_given.map((delegation) => ({
                id: delegation.id,
                delegator: delegation.delegator,
                delegatee: delegation.delegatee,
                start_date: delegation.start_date,
                end_date: delegation.end_date,
              }))
            ) ?? [];
      }

      return data;
    }),
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
