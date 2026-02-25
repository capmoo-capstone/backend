import { prisma } from '../config/prisma';
import { UserRole } from '@prisma/client';
import {
  UpdateRepresentativeUnitDto,
  UpdateRoleDto,
  UpdateUserUnitDto,
  UsersListFilters,
  UsersListResponse,
} from '../models/User';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { isDeptLevelRole, isUnitLevelRole } from '../lib/roles';

export const listUsers = async (
  filters: UsersListFilters
): Promise<Partial<UsersListResponse>> => {
  const { unitId, deptId } = filters;

  let data: Partial<UsersListResponse> = {};

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

export const getById = async (id: string): Promise<any> => {
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
  return { data: user };
};

const upsertUserRoleInternal = async (
  tx: any,
  params: {
    userId: string;
    role: UserRole;
    deptId: string;
    unitId: string | null;
  }
) => {
  const { userId, role, deptId, unitId } = params;

  const userRoles = await tx.userOrganizationRole.findMany({
    where: { user_id: userId, dept_id: deptId },
    include: { role: true },
  });

  const sameUnitAssignment = userRoles.find((a: any) => a.unit_id === unitId);
  const guestAssignment = userRoles.find((a: any) => a.role === UserRole.GUEST);

  let result;
  if (sameUnitAssignment) {
    result = await tx.userOrganizationRole.update({
      where: { id: sameUnitAssignment.id },
      data: { role },
    });
  }
  else if (guestAssignment && userRoles.length === 1) {
    result = await tx.userOrganizationRole.update({
      where: { id: guestAssignment.id },
      data: { role, unit_id: unitId },
    });
  }
  else 
    result = await tx.userOrganizationRole.create({
    data: {
      user_id: userId,
      role,
      dept_id: deptId,
      unit_id: unitId,
    },
  });

  await tx.user.update({
    where: { id: userId },
    data: { role_updated_at: new Date() },
  });

  return result;
};

export const addUsersToSupplyUnit = async (
  data: UpdateUserUnitDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: data.unit_id },
      select: { id: true, dept_id: true },
    });
    if (!unit) throw new NotFoundError('Unit not found');

    const userIds = data.users.map((u) => u.id);
    const usersCount = await tx.user.count({ where: { id: { in: userIds } } });

    if (usersCount !== data.users.length) {
      throw new NotFoundError('One or more users not found');
    }
    for (const user of data.users) {
      await upsertUserRoleInternal(tx, {
        userId: user.id,
        role: UserRole.GENERAL_STAFF,
        deptId: unit.dept_id,
        unitId: unit.id,
      });
    }

    return {
      count: data.users.length,
      message: `${data.users.length} users processed successfully.`,
    };
  });
};

export const addRepresentativeToUnit = async (
  data: UpdateRepresentativeUnitDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: data.unit_id },
      select: { id: true, department: { select: { id: true } } },
    });

    if (!unit) throw new NotFoundError('Unit not found');
    if (unit.department?.id === 'DEPT-SUP-OPS') {
      throw new BadRequestError(
        'Representative role is not allowed for SUPPLY units'
      );
    }

    await upsertUserRoleInternal(tx, {
      userId: data.id,
      role: UserRole.REPRESENTATIVE,
      deptId: unit.department!.id,
      unitId: unit.id,
    });

    return tx.user.findUnique({
      where: { id: data.id },
      include: {
        roles: {
          include: { department: true, unit: true },
        },
      },
    });
  });
};

export const updateRole = async (
  id: string,
  data: UpdateRoleDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    if (isUnitLevelRole(data.role) && !data.unit_id) {
      throw new BadRequestError('Unit is required for unit-level roles');
    }
    if (isDeptLevelRole(data.role) && data.unit_id) {
      throw new BadRequestError('Unit is not allowed for department roles');
    }

    const targetUnitId = isUnitLevelRole(data.role) ? data.unit_id! : null;

    const result = await upsertUserRoleInternal(tx, {
      userId: id,
      role: data.role,
      deptId: data.dept_id,
      unitId: targetUnitId,
    });

    return { data: result };
  });
};

export const deleteUser = async (id: string): Promise<void> => {
  await getById(id);
  await prisma.user.delete({
    where: { id },
  });
};
