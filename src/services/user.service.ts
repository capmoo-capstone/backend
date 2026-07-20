import { AuditEventType, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { OPS_DEPT_ID } from '../lib/constant';
import { BadRequestError, NotFoundError } from '../lib/errors';
import {
  addRoleInternal,
  assertNoDuplicatesOrOverlap,
  assertUsersExist,
  removeRoleInternal,
} from '../lib/user-role';
import {
  AddRoleDto,
  RemoveRoleDto,
  UpdateSupplyRoleDto,
} from '../schemas/user.schema';
import {
  UpdateUserRoleResponse,
  UserDetailResponse,
  UserListFilters,
  UserListResponse,
} from '../types/user.type';
import { AuthPayload } from '../types/auth.type';
import { recordUserManagementAuditEvent } from './audit-log.service';

type RoleAssignment = {
  id: string;
  user_id: string;
  role: UserRole;
  dept_id: string;
  unit_id: string | null;
};

type RoleMutationParams = {
  userId: string;
  role: UserRole;
  deptId: string;
  unitId: string | null;
};

const roleAssignmentSelect = {
  id: true,
  user_id: true,
  role: true,
  dept_id: true,
  unit_id: true,
};

const findRoleAssignment = async (
  tx: Prisma.TransactionClient,
  params: RoleMutationParams
): Promise<RoleAssignment | null> =>
  await tx.userOrganizationRole.findFirst({
    where: {
      user_id: params.userId,
      role: params.role,
      dept_id: params.deptId,
      unit_id: params.unitId,
    },
    select: roleAssignmentSelect,
  });

const findReplacedRoleAssignment = async (
  tx: Prisma.TransactionClient,
  params: RoleMutationParams
): Promise<RoleAssignment | null> => {
  const roles = await tx.userOrganizationRole.findMany({
    where: { user_id: params.userId, dept_id: params.deptId },
    select: roleAssignmentSelect,
  });

  if (params.unitId !== null) {
    return (
      roles.find((role) => role.unit_id === params.unitId) ??
      (roles.length === 1 && roles[0].role === UserRole.GUEST ? roles[0] : null)
    );
  }

  return roles.length === 1 && roles[0].role === UserRole.GUEST
    ? roles[0]
    : null;
};

const buildAssignmentDiff = (
  previous: RoleAssignment | null,
  current: RoleAssignment
) => [
  {
    field: 'role',
    oldValue: previous?.role ?? null,
    newValue: current.role,
  },
  {
    field: 'unit_id',
    oldValue: previous?.unit_id ?? null,
    newValue: current.unit_id,
  },
];

const addRoleWithAudit = async (
  tx: Prisma.TransactionClient,
  actor: AuthPayload,
  params: RoleMutationParams,
  eventType: 'USER_ROLE_ASSIGNED' | 'UNIT_STAFF_ADDED'
): Promise<UpdateUserRoleResponse> => {
  const previous = await findReplacedRoleAssignment(tx, params);
  const assignment = await addRoleInternal(tx, params);
  const auditAssignment: RoleAssignment = {
    ...assignment,
    user_id: params.userId,
  };

  await recordUserManagementAuditEvent(tx, {
    eventType,
    actor,
    assignment: auditAssignment,
    diff: buildAssignmentDiff(previous, auditAssignment),
  });

  return assignment;
};

const removeRoleWithAudit = async (
  tx: Prisma.TransactionClient,
  actor: AuthPayload,
  params: RoleMutationParams,
  eventType: 'USER_ROLE_REMOVED' | 'UNIT_STAFF_REMOVED'
): Promise<void> => {
  const assignment = await findRoleAssignment(tx, params);
  await removeRoleInternal(tx, params);

  if (!assignment) return;

  await recordUserManagementAuditEvent(tx, {
    eventType,
    actor,
    assignment,
    diff: [
      { field: 'role', oldValue: assignment.role, newValue: null },
      { field: 'unit_id', oldValue: assignment.unit_id, newValue: null },
    ],
  });
};

export const listUsers = async (
  filters: UserListFilters
): Promise<UserListResponse> => {
  const { unitId, deptId, role } = filters;
  const roleWhere = {
    ...(unitId ? { unit_id: unitId } : {}),
    ...(deptId ? { dept_id: deptId } : {}),
    ...(role ? { role } : {}),
  };
  const userWhere = { roles: { some: roleWhere } };

  let data: UserListResponse;

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
          roles: { some: roleWhere },
        },
        select: {
          id: true,
          full_name: true,
          roles: {
            where: roleWhere,
            select: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          roles: { some: roleWhere },
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
          roles: { some: roleWhere },
        },
        select: {
          id: true,
          full_name: true,
          roles: {
            where: roleWhere,
            select: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          roles: { some: roleWhere },
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
        where: role ? userWhere : {},
        select: {
          id: true,
          full_name: true,
          roles: {
            where: role ? roleWhere : undefined,
            select: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({ where: role ? userWhere : {} }),
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
  actor: AuthPayload,
  data: UpdateSupplyRoleDto
): Promise<{ added: number; removed: number }> => {
  const { role, unit_id, new_users, remove_users } = data;
  const unitId = role === UserRole.HEAD_OF_UNIT ? unit_id! : null;

  if (new_users.length === 0 && remove_users.length === 0) {
    throw new BadRequestError('No users to add or remove');
  }

  assertNoDuplicatesOrOverlap(new_users, remove_users);

  return await prisma.$transaction(async (tx) => {
    if (role === UserRole.HEAD_OF_UNIT) {
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
        select: { dept_id: true },
      });
      if (!unit) {
        throw new NotFoundError('Unit not found');
      }
      if (unit.dept_id !== OPS_DEPT_ID) {
        throw new BadRequestError(
          'HEAD_OF_UNIT can only be assigned to Supply Operation units'
        );
      }
    }

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

    if (role === UserRole.HEAD_OF_UNIT && new_users.length > 0) {
      const existingHead = await tx.userOrganizationRole.findFirst({
        where: {
          dept_id: OPS_DEPT_ID,
          unit_id: unitId,
          role: UserRole.HEAD_OF_UNIT,
          user_id: { notIn: remove_users },
        },
      });
      if (existingHead) {
        throw new BadRequestError(
          'Unit already has a HEAD_OF_UNIT. Include them in remove_users to replace.'
        );
      }
    }

    // REMOVE
    for (const userId of remove_users) {
      await removeRoleWithAudit(
        tx,
        actor,
        {
          userId,
          role,
          deptId: OPS_DEPT_ID,
          unitId,
        },
        AuditEventType.USER_ROLE_REMOVED
      );
    }

    // ADD
    for (const userId of new_users) {
      await addRoleWithAudit(
        tx,
        actor,
        {
          userId,
          role,
          deptId: OPS_DEPT_ID,
          unitId,
        },
        AuditEventType.USER_ROLE_ASSIGNED
      );
    }

    return { added: new_users.length, removed: remove_users.length };
  });
};

export const addRole = async (
  actor: AuthPayload,
  data: AddRoleDto
): Promise<UpdateUserRoleResponse> => {
  return await prisma.$transaction(async (tx) => {
    await assertUsersExist(tx, [data.user_id]);

    return await addRoleWithAudit(
      tx,
      actor,
      {
        userId: data.user_id,
        role: data.role,
        deptId: data.dept_id,
        unitId: data.unit_id ?? null,
      },
      AuditEventType.USER_ROLE_ASSIGNED
    );
  });
};

export const removeRole = async (
  actor: AuthPayload,
  data: RemoveRoleDto
): Promise<void> => {
  return await prisma.$transaction(async (tx) => {
    await assertUsersExist(tx, [data.user_id]);

    await removeRoleWithAudit(
      tx,
      actor,
      {
        userId: data.user_id,
        role: data.role,
        deptId: data.dept_id,
        unitId: data.unit_id ?? null,
      },
      AuditEventType.USER_ROLE_REMOVED
    );
  });
};
