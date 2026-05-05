import { prisma } from '../config/prisma';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/errors';
import jwt from 'jsonwebtoken';
import { RegisterUserDto } from '../schemas/user.schema';
import { isDeptLevelRole, isUnitLevelRole } from '../lib/roles';
import {
  FetchAndFormatUserDetailsResponse,
  LoginResponse,
  RegisterResponse,
  AuthPayload,
} from '../types/auth.type';
import { clearUserAuthCache } from '../lib/auth-cache';
import bcrypt from 'bcrypt';

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
        include: {
          delegator: {
            include: {
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

  const ownRoles = formatRoles(user.roles);
  const inheritedRoles =
    user.delegations_received.length > 0
      ? formatRoles(user.delegations_received.flatMap((d) => d.delegator.roles))
      : [];

  const finalRoles = [...ownRoles, ...inheritedRoles];
  const isDelegated = user.delegations_received.length > 0;
  const delegatedBy = user.delegations_received.map((d) => ({
    id: d.delegator.id,
    full_name: d.delegator.full_name,
    roles: formatRoles(d.delegator.roles),
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
