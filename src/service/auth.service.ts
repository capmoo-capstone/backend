import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/errors';
import jwt from 'jsonwebtoken';
import { RegisterUserDto } from '../models/User';
import { isDeptLevelRole, isUnitLevelRole } from '../lib/roles';

export const login = async (
  username: string,
  full_name: string
): Promise<any> => {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { username, full_name },
    include: {
      roles: {
        include: {
          role: true,
          department: { select: { id: true, code: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      delegations_received: {
        where: {
          is_active: true,
          start_date: { lte: now },
          end_date: { gte: now },
        },
        include: {
          delegator: {
            include: {
              roles: {
                include: {
                  role: true,
                  department: { select: { id: true, code: true, name: true } },
                  unit: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const formatRoles = (orgRoles: any[]) =>
    orgRoles.map((r) => ({
      role: r.role.name,
      dept_id: r.department.id,
      unit_id: r.unit?.id || null,
    }));

  const ownRoles = formatRoles(user.roles);
  const inheritedRoles =
    user.delegations_received.length > 0
      ? formatRoles(user.delegations_received.flatMap((d) => d.delegator.roles))
      : [];

  const tokenPayload = {
    id: user.id,
    username: user.username,
    roles: {
      own: ownRoles,
      delegated: inheritedRoles,
    },
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET as string, {
    expiresIn: '3h',
  });

  return {
    data: {
      token,
      id: user.id,
      is_delegated: user.delegations_received.length > 0,
      roles: {
        own: ownRoles,
        delegated: inheritedRoles,
      },
    },
  };
};

export const register = async (data: RegisterUserDto): Promise<any> => {
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

    const roleRecord = await tx.userRole.findUnique({
      where: { name: data.role },
    });
    if (!roleRecord) {
      console.error(`Role not found: ${data.role}`);
      throw new NotFoundError('Role not found');
    }

    const newUser = await tx.user.create({
      data: {
        username: data.username,
        full_name: data.full_name,
        roles: {
          create: [
            {
              role_id: roleRecord.id,
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
            role: true,
            department: { select: { id: true, code: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        created_at: true,
      },
    });

    return newUser;
  });

  return { data: result };
};

const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired token');
  }
};

export const getMe = async (token: string) => {
  const decoded: any = verifyToken(token);
  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    include: {
      roles: {
        include: {
          role: true,
          department: { select: { id: true, code: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      delegations_received: {
        where: {
          is_active: true,
          start_date: { lte: new Date() },
          end_date: { gte: new Date() },
        },
        include: {
          delegator: {
            include: {
              roles: {
                include: {
                  role: true,
                  department: { select: { id: true, code: true, name: true } },
                  unit: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const formatRoles = (orgRoles: any[]) =>
    orgRoles.map((r) => ({
      role: r.role.name,
      dept_id: r.department.id,
      dept_code: r.department.code,
      dept_name: r.department.name,
      unit_id: r.unit?.id || null,
      unit_name: r.unit?.name || null,
    }));

  const ownRoles = formatRoles(user.roles);
  const inheritedRoles =
    user.delegations_received.length > 0
      ? formatRoles(user.delegations_received.flatMap((d) => d.delegator.roles))
      : [];

  return {
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      is_delegated: user.delegations_received.length > 0,
      roles: {
        own: ownRoles,
        delegated: inheritedRoles,
      },
    },
  };
};
