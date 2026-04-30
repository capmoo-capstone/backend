import { prisma } from '../config/prisma';
import {
  UpdateUserRoleResponse,
  UserDetailResponse,
  UsersListFilters,
  UsersListResponse,
} from '../types/user.type';
import {
  AddRoleDto,
  RemoveRoleDto,
  UpdateSupplyRoleDto,
} from '../schemas/user.schema';
import { BadRequestError, NotFoundError } from '../lib/errors';
import {
  addRoleInternal,
  assertNoDuplicatesOrOverlap,
  assertUsersExist,
  removeRoleInternal,
} from '../lib/user-role';
import { UserRole } from '@prisma/client';
import { OPS_DEPT_ID } from '../lib/constant';

export const listUsers = async (
  filters: UsersListFilters
): Promise<UsersListResponse> => {
  const { unitId, deptId } = filters;

  let data: UsersListResponse;

  if (unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, name: true },
    });
    if (!unit) {
      throw new NotFoundError('Unit not found');
    }
    const [users, count] = await Promise.all([
      prisma.user.findMany({
        where: {
          roles: {
            some: {
              unit_id: unitId,
            },
          },
        },
        select: {
          id: true,
          full_name: true,
          roles: {
            where: {
              unit_id: unitId,
            },
            select: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          roles: {
            some: {
              unit_id: unitId,
            },
          },
        },
      }),
    ]);

    data = {
      id: unit.id,
      entity_type: 'unit',
      name: unit.name,
      total: count,
      data: users.map((u) => {
        return {
          id: u.id,
          full_name: u.full_name,
          roles: u.roles.map((r) => r.role),
        };
      }),
    };
  } else if (deptId) {
    const department = await prisma.department.findUnique({
      where: { id: deptId },
      select: { id: true, name: true },
    });
    if (!department) {
      throw new NotFoundError('Department not found');
    }
    const [users, count] = await Promise.all([
      prisma.user.findMany({
        where: {
          roles: {
            some: {
              dept_id: deptId,
            },
          },
        },
        select: {
          id: true,
          full_name: true,
          roles: {
            where: {
              dept_id: deptId,
            },
            select: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          roles: {
            some: {
              dept_id: deptId,
            },
          },
        },
      }),
    ]);
    data = {
      id: department.id,
      entity_type: 'department',
      name: department.name,
      total: count,
      data: users.map((u) => {
        return {
          id: u.id,
          full_name: u.full_name,
          roles: u.roles.map((r) => r.role),
        };
      }),
    };
  } else {
    const [users, count] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          full_name: true,
          roles: {
            select: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ]);
    data = {
      id: 'all',
      entity_type: 'all',
      name: 'All Users',
      total: count,
      data: users.map((u) => {
        return {
          id: u.id,
          full_name: u.full_name,
          roles: u.roles.map((r) => r.role),
        };
      }),
    };
  }

  return data;
};

export const getById = async (id: string): Promise<UserDetailResponse> => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: {
        select: {
          role: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
};

export const deleteUser = async (id: string): Promise<void> => {
  await getById(id);
  await prisma.user.delete({
    where: { id },
  });
};

export const updateSupplyRole = async (
  data: UpdateSupplyRoleDto
): Promise<{ added: number; removed: number }> => {
  const { role, new_users, remove_users } = data;

  if (new_users.length === 0 && remove_users.length === 0) {
    throw new BadRequestError('No users to add or remove');
  }

  assertNoDuplicatesOrOverlap(new_users, remove_users);

  return await prisma.$transaction(async (tx) => {
    await assertUsersExist(tx, [...new_users, ...remove_users]);

    // HEAD_OF_DEPARTMENT — enforce 1 คน
    if (role === UserRole.HEAD_OF_DEPARTMENT && new_users.length > 0) {
      const existingHead = await tx.userOrganizationRole.findFirst({
        where: {
          dept_id: OPS_DEPT_ID,
          role: UserRole.HEAD_OF_DEPARTMENT,
          user_id: { notIn: remove_users },
        },
      });
      if (existingHead) {
        throw new BadRequestError(
          'Department already has a HEAD_OF_DEPARTMENT. Include them in remove_users to replace.'
        );
      }
    }

    // REMOVE
    for (const userId of remove_users) {
      await removeRoleInternal(tx, {
        userId,
        role,
        deptId: OPS_DEPT_ID,
        unitId: null,
      });
    }

    // ADD
    for (const userId of new_users) {
      await addRoleInternal(tx, {
        userId,
        role,
        deptId: OPS_DEPT_ID,
        unitId: null,
      });
    }

    return { added: new_users.length, removed: remove_users.length };
  });
};

export const addRole = async (
  data: AddRoleDto
): Promise<UpdateUserRoleResponse> => {
  return await prisma.$transaction(async (tx) => {
    await assertUsersExist(tx, [data.user_id]);

    return await addRoleInternal(tx, {
      userId: data.user_id,
      role: data.role,
      deptId: data.dept_id,
      unitId: data.unit_id ?? null,
    });
  });
};

export const removeRole = async (data: RemoveRoleDto): Promise<void> => {
  return await prisma.$transaction(async (tx) => {
    await assertUsersExist(tx, [data.user_id]);

    await removeRoleInternal(tx, {
      userId: data.user_id,
      role: data.role,
      deptId: data.dept_id,
      unitId: data.unit_id ?? null,
    });
  });
};
