import { prisma } from '../config/prisma';
import { UserRole } from '@prisma/client';
import { UsersListFilters, UsersListResponse } from '../types/user.type';
import {
  UpdateRepresentativeUnitDto,
  UpdateRoleDto,
  UpdateUserUnitDto,
} from '../schemas/user.schema';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { isDeptLevelRole, isUnitLevelRole } from '../lib/roles';
import { SUPPLY_UNIT_ID, OPS_DEPT_ID } from '../lib/constant';

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
    select: { id: true, role: true, unit_id: true },
  });

  const sameUnitAssignment = userRoles.find((a: any) => a.unit_id === unitId);
  const guestAssignment = userRoles.find((a: any) => a.role === UserRole.GUEST);

  let result;
  if (sameUnitAssignment) {
    result = await tx.userOrganizationRole.update({
      where: { id: sameUnitAssignment.id },
      data: { role },
    });
  } else if (guestAssignment && userRoles.length === 1) {
    result = await tx.userOrganizationRole.update({
      where: { id: guestAssignment.id },
      data: { role, unit_id: unitId },
    });
  } else
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
    if (unit.dept_id !== OPS_DEPT_ID) {
      throw new BadRequestError(
        'This endpoint is only for units under the Supply department'
      );
    }

    const usersCount = await tx.user.count({
      where: { id: { in: data.users } },
    });

    if (usersCount !== data.users.length) {
      throw new NotFoundError('One or more users not found');
    }

    for (const id of data.users) {
      const user = await tx.user.findUnique({
        where: { id },
        select: {
          full_name: true,
          roles: { select: { role: true, dept_id: true, unit_id: true } },
        },
      });

      if (user!.roles.some((r: any) => r.unit_id === SUPPLY_UNIT_ID)) {
        await upsertUserRoleInternal(tx, {
          userId: id,
          role: UserRole.GENERAL_STAFF,
          deptId: OPS_DEPT_ID,
          unitId: unit.id,
        });
      } else
        throw new BadRequestError(
          `User ${user!.full_name} cannot be added to Supply Operation units`
        );
    }

    return {
      count: data.users.length,
      message: `${data.users.length} users added to Supply unit ${data.unit_id} successfully.`,
    };
  });
};

export const addRepresentativeToUnit = async (
  data: UpdateRepresentativeUnitDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const userOrgRoles = await tx.userOrganizationRole.findFirst({
      where: { unit_id: data.unit_id, role: UserRole.REPRESENTATIVE },
      select: { id: true },
    });
    if (userOrgRoles) {
      throw new BadRequestError(
        'Unit already has a representative. Please remove the existing representative before adding a new one.'
      );
    }

    const unit = await tx.unit.findUnique({
      where: { id: data.unit_id },
      select: { id: true, department: { select: { id: true } } },
    });
    if (!unit) throw new NotFoundError('Unit not found');
    if (unit.department?.id === OPS_DEPT_ID) {
      throw new BadRequestError(
        'Representative role is not allowed for SUPPLY units'
      );
    }

    const user = await tx.user.findUnique({
      where: { id: data.id },
      select: {
        roles: { select: { role: true, dept_id: true, unit_id: true } },
      },
    });
    if (!user) throw new NotFoundError('User not found');

    if (
      user.roles.some(
        (r: any) => r.role === UserRole.REPRESENTATIVE && r.unit_id === unit.id
      )
    ) {
      throw new BadRequestError(
        'User is already a representative for this unit'
      );
    }

    const result = await upsertUserRoleInternal(tx, {
      userId: data.id,
      role: UserRole.REPRESENTATIVE,
      deptId: unit.department!.id,
      unitId: unit.id,
    });

    return { data: result };
  });
};

export const updateRole = async (
  id: string,
  data: UpdateRoleDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: {
        roles: { select: { role: true, dept_id: true, unit_id: true } },
      },
    });
    if (!user) throw new NotFoundError('User not found');
    if (isUnitLevelRole(data.role) && !data.unit_id) {
      throw new BadRequestError('Unit is required for unit-level roles');
    }
    if (isDeptLevelRole(data.role) && data.unit_id) {
      throw new BadRequestError('Unit is not allowed for department roles');
    }

    const targetUnitId = isUnitLevelRole(data.role) ? data.unit_id! : null;

    if (
      user.roles.some(
        (r: any) =>
          r.role === data.role &&
          r.dept_id === data.dept_id &&
          r.unit_id === targetUnitId
      )
    ) {
      throw new BadRequestError(
        'User already has this role assigned in this unit/department'
      );
    }

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
