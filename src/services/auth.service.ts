import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { clearUserAuthCache } from '../lib/auth-cache';
import { OPS_DEPT_ID } from '../lib/constant';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/errors';
import { isDeptLevelRole, isUnitLevelRole } from '../lib/roles';
import { RegisterUserDto } from '../schemas/user.schema';
import {
  AuthPayload,
  FetchAndFormatUserDetailsResponse,
  LoginResponse,
  RegisterResponse,
} from '../types/auth.type';

export const fetchAndFormatUserDetails = async (
  whereClause: any
): Promise<FetchAndFormatUserDetailsResponse | null> => {
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: whereClause,
    include: {
      roles: {
        include: {
          department: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      delegations_received: {
        where: {
          is_active: true,
          start_date: { lte: now },
          OR: [{ end_date: null }, { end_date: { gte: now } }],
        },
        select: {
          role: true,
          unit_id: true,
          start_date: true,
          end_date: true,
          delegator: {
            select: {
              id: true,
              full_name: true,
              roles: {
                include: {
                  department: { select: { id: true, name: true } },
                  unit: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const formatRoles = (orgRoles: any[]) =>
    orgRoles.map((r) => ({
      role: r.role,
      dept_id: r.department.id,
      dept_name: r.department.name,
      unit_id: r.unit?.id || null,
      unit_name: r.unit?.name || null,
    }));

  const getDelegatedRoles = (delegation: any) =>
    delegation.delegator.roles.filter(
      (role: any) =>
        delegation.role === role.role &&
        role.dept_id === OPS_DEPT_ID &&
        (delegation.unit_id ?? null) === (role.unit_id ?? null)
    );

  const ownRoles = formatRoles(user.roles);
  const delegatedEntries = user.delegations_received.map((delegation) => ({
    id: delegation.delegator.id,
    full_name: delegation.delegator.full_name,
    roles: getDelegatedRoles(delegation).flatMap((role: any) => ({
      role: role.role,
      dept_id: role.dept_id,
      dept_name: role.department.name,
      unit_id: role.unit_id,
      unit_name: role.unit.name,
    })),
    start_date: delegation.start_date,
    end_date: delegation.end_date,
  }));
  const inheritedRoles = delegatedEntries.flatMap((entry) => entry.roles);

  const finalRoles = [...ownRoles, ...inheritedRoles];
  const isDelegated = delegatedEntries.length > 0;
  const delegatedBy = delegatedEntries.map((entry) => ({
    id: entry.id,
    full_name: entry.full_name,
    role: entry.roles.length > 0 ? entry.roles[0].role : null,
    dept_id: entry.roles.length > 0 ? entry.roles[0].dept_id : null,
    unit_id: entry.roles.length > 0 ? entry.roles[0].unit_id : null,
    start_date: entry.start_date,
    end_date: entry.end_date,
  }));

  return {
    user, // Raw user data (id, username, full_name, email, etc.)
    authData: {
      // Formatted data for the cache/tokens
      roles: finalRoles,
      is_delegated: isDelegated,
      delegated_by: delegatedBy,
    },
  };
};

export const login = async (
  username: string,
  password: string
): Promise<LoginResponse> => {
  const userRecord = await prisma.user.findUnique({
    where: { username },
    select: { id: true, password: true },
  });

  if (!userRecord) {
    throw new UnauthorizedError('Invalid username or password');
  }

  const checkPassword = bcrypt.compareSync(
    password,
    userRecord?.password || ''
  );

  if (!checkPassword) {
    throw new UnauthorizedError('Invalid username or password');
  }

  const result = await fetchAndFormatUserDetails({ id: userRecord.id });

  if (!result) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const { user, authData } = result;

  const tokenPayload = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET as string, {
    expiresIn: '3h',
  });

  return {
    token,
    id: user.id,
    ...authData, // Spread the roles and delegations perfectly
  };
};
export const register = async (
  data: RegisterUserDto
): Promise<RegisterResponse> => {
  const existingUser = await prisma.user.findUnique({
    where: { username: data.username },
  });

  if (existingUser) {
    throw new AppError('User already exists', 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const departmentRecord = await tx.department.findUnique({
      where: { id: data.dept_id },
      include: { units: true },
    });

    if (!departmentRecord) {
      throw new NotFoundError('Department not found');
    }

    if (isUnitLevelRole(data.role) && !data.unit_id) {
      throw new BadRequestError('Unit is required for unit-level roles');
    }

    if (isDeptLevelRole(data.role) && data.unit_id) {
      throw new BadRequestError('Unit is not allowed for department roles');
    }

    if (
      data.unit_id &&
      !departmentRecord.units.find((u) => u.id === data.unit_id)
    ) {
      throw new NotFoundError('Unit not found in this department');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const newUser = await tx.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        full_name: data.full_name,
        email: data.email,
        roles: {
          create: [
            {
              role: data.role,
              dept_id: data.dept_id,
              unit_id: data.unit_id || null,
            },
          ],
        },
      },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        roles: {
          include: {
            department: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        created_at: true,
      },
    });

    return newUser;
  });

  return result;
};

/**
 * Clears server-side cached authorization data for the current user.
 *
 * Note: this does not revoke or invalidate an already-issued JWT. Any valid
 * token will remain usable until it expires unless token revocation is
 * enforced during authentication (for example via jti denylisting or a
 * refresh-token/session store).
 */
export const clearSessionCache = async (
  payload: AuthPayload
): Promise<void> => {
  clearUserAuthCache(payload.id);
};
// Backward-compatible alias; retains existing behavior but callers should
// prefer `clearSessionCache` to avoid implying JWT revocation.
export const logout = clearSessionCache;
