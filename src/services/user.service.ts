import {
  AuditEventType,
  AuditLogType,
  AuditTargetType,
  Prisma,
  RegisterType,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import { OPS_DEPT_ID } from '../utils/constant';
import { AppError, BadRequestError, NotFoundError } from '../utils/errors';
import { assertUserCanBeDeleted } from '../utils/deletion-policy';
import {
  assertDepartmentUnitScope,
  assertManageableRoleScope,
} from '../utils/roles';
import {
  addRoleInternal,
  assertNoDuplicatesOrOverlap,
  assertUsersExist,
  removeRoleInternal,
} from '../utils/user-role';
import {
  AddRoleDto,
  CreateUserDto,
  RemoveRoleDto,
  UpdateSupplyRoleDto,
} from '../schemas/user.schema';
import {
  ListUsersQuery,
  RoleAssignment,
  RoleMutationParams,
  UpdateUserRoleResponse,
  UserDetailResponse,
} from '../types/user.type';
import { AuthPayload } from '../types/auth.type';
import {
  recordAuditEvent,
  recordUserManagementAuditEvent,
} from './audit-log.service';
import { PaginatedResponse } from '../types/common.type';

const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  full_name: true,
  register_type: true,
  is_active: true,
  created_at: true,
  role_updated_at: true,
  last_login_at: true,
  roles: {
    select: {
      id: true,
      role: true,
      department: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
    },
  },
};

const assertNoExistingUser = async (
  tx: Prisma.TransactionClient,
  username: string,
  email: string
) => {
  const existingUser = await tx.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError('Username or email already exists', 409);
  }
};

const roleAssignmentSelect = {
  id: true,
  user_id: true,
  role: true,
  dept_id: true,
  unit_id: true,
};

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
  data: RoleMutationParams,
  type: 'REMOVE' | 'REVOKE'
): Promise<void> => {
  let assignment;
  if (type === 'REVOKE') {
    assignment = await tx.userOrganizationRole.findFirst({
      where: {
        user_id: data.userId,
        dept_id: data.deptId,
        unit_id: data.unitId,
        role: data.role,
      },
      select: roleAssignmentSelect,
    });
    if (!assignment) throw new NotFoundError('Role not found');

    await removeRoleInternal(tx, {
      userId: assignment.user_id,
      role: assignment.role,
      deptId: assignment.dept_id,
      unitId: assignment.unit_id,
    });

    await recordUserManagementAuditEvent(tx, {
      eventType: 'USER_ROLE_REMOVED',
      actor,
      assignment,
      diff: [
        { field: 'role', oldValue: assignment.role, newValue: null },
        { field: 'unit_id', oldValue: assignment.unit_id, newValue: null },
      ],
    });
  }

  if (type === 'REMOVE') {
    assignment = await tx.userOrganizationRole.findFirst({
      where: { id: data.roleId },
      select: roleAssignmentSelect,
    });

    if (!assignment) throw new NotFoundError('Role not found');

    await tx.userOrganizationRole.delete({
      where: { id: data.roleId },
    });

    await recordUserManagementAuditEvent(tx, {
      eventType: 'USER_ROLE_REMOVED',
      actor,
      assignment,
      diff: [
        { field: 'role', oldValue: assignment.role, newValue: null },
        { field: 'dept_id', oldValue: assignment.dept_id, newValue: null },
        { field: 'unit_id', oldValue: assignment.unit_id, newValue: null },
      ],
    });
  }
};

export const listUsers = async (
  page: number = 1,
  limit: number = 10,
  filters: ListUsersQuery
): Promise<PaginatedResponse<UserDetailResponse>> => {
  const roleWhere = {
    ...(filters.unitId && filters.unitId.length > 0
      ? { unit_id: { in: filters.unitId } }
      : {}),
    ...(filters.deptId && filters.deptId.length > 0
      ? { dept_id: { in: filters.deptId } }
      : {}),
    ...(filters.role && filters.role.length > 0
      ? { role: { in: filters.role } }
      : {}),
  };

  const andConditions: Prisma.UserWhereInput[] = [];

  if (Object.keys(roleWhere).length > 0) {
    andConditions.push({ roles: { some: roleWhere } });
  }

  if (filters.isActive !== undefined) {
    andConditions.push({ is_active: filters.isActive });
  }

  if (filters.search?.trim()) {
    const searchTerm = filters.search.trim();
    andConditions.push({
      OR: [
        { full_name: { contains: searchTerm, mode: 'insensitive' } },
        { username: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ],
    });
  }

  const userWhere: Prisma.UserWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const [users, count] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      skip: (page - 1) * limit,
      take: limit,
      select: safeUserSelect,
      orderBy: { full_name: 'asc' },
    }),
    prisma.user.count({ where: userWhere }),
  ]);

  return {
    total: count,
    page,
    pageSize: limit,
    totalPages: Math.ceil(count / limit),
    data: users,
  };
};

export const getById = async (id: string): Promise<UserDetailResponse> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: safeUserSelect,
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
};

export const createUser = async (actor: AuthPayload, data: CreateUserDto) => {
  return await prisma.$transaction(async (tx) => {
    await assertDepartmentUnitScope(tx, {
      deptId: data.dept_id,
      unitId: data.unit_id,
    });
    await assertNoExistingUser(tx, data.username, data.email);

    const password = data.register_type.includes(RegisterType.STANDARD)
      ? await bcrypt.hash(data.password!, 10)
      : null;
    const user = await tx.user.create({
      data: {
        username: data.username,
        email: data.email,
        full_name: data.full_name,
        password,
        register_type: data.register_type,
        roles: {
          create: {
            role: data.role,
            dept_id: data.dept_id,
            unit_id: data.unit_id,
          },
        },
      },
      select: safeUserSelect,
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_MANAGEMENT,
      eventType: AuditEventType.USER_CREATED,
      targetType: AuditTargetType.USER,
      targetId: user.id,
      actor,
      targetSnapshot: {
        id: user.id,
        type: AuditTargetType.USER,
        name: user.full_name,
        refNo: user.username,
        email: user.email,
        registerType: user.register_type,
        role: data.role,
      },
      diff: [{ field: 'user', oldValue: null, newValue: user }],
      metadata: { departmentId: data.dept_id, unitId: data.unit_id },
      sourceTable: 'users',
      sourceId: user.id,
      occurredAt: user.created_at,
    });

    return user;
  });
};

export const deleteUser = async (id: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundError('User not found');
    await assertUserCanBeDeleted(tx, id);
    await tx.user.delete({ where: { id } });
  });
};

export const updateUserStatus = async (
  user: AuthPayload,
  targetUserId: string,
  isActive: boolean
): Promise<UserDetailResponse> => {
  if (user.id === targetUserId) {
    throw new BadRequestError('Cannot update your own active status');
  }

  return await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, is_active: true, full_name: true, username: true },
    });

    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    if (existingUser.is_active === isActive) {
      const user = await tx.user.findUnique({
        where: { id: targetUserId },
        select: safeUserSelect,
      });
      return user!;
    }

    const updatedUser = await tx.user.update({
      where: { id: targetUserId },
      data: {
        is_active: isActive,
        role_updated_at: new Date(),
      },
      select: safeUserSelect,
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_MANAGEMENT,
      eventType: AuditEventType.USER_STATUS_UPDATED,
      targetType: AuditTargetType.USER,
      targetId: updatedUser.id,
      actor: user,
      targetSnapshot: {
        id: updatedUser.id,
        type: AuditTargetType.USER,
        name: updatedUser.full_name,
        username: updatedUser.username,
        is_active: updatedUser.is_active,
      },
      diff: [
        {
          field: 'is_active',
          oldValue: existingUser.is_active,
          newValue: isActive,
        },
      ],
    });

    return updatedUser;
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
        'REVOKE'
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
    await assertManageableRoleScope(tx, {
      role: data.role,
      deptId: data.dept_id,
      unitId: data.unit_id ?? null,
    });

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
  user: AuthPayload,
  data: RemoveRoleDto
): Promise<void> => {
  return await prisma.$transaction(async (tx) => {
    await removeRoleWithAudit(tx, user, data, 'REVOKE');
  });
};

export const removeRoleById = async (
  user: AuthPayload,
  roleId: string
): Promise<void> => {
  return await prisma.$transaction(async (tx) => {
    await removeRoleWithAudit(tx, user, { roleId }, 'REMOVE');
  });
};
