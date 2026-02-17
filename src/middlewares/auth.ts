import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { Role } from '@prisma/client';
import { AuthPayload } from '../lib/types';
import { prisma } from '../config/prisma';

interface JwtPayload {
  id: string;
  username: string;
  full_name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export const protect = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization header missing or invalid');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;

    const now = new Date();
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
            start_date: { lte: now },
            OR: [{ end_date: null }, { end_date: { gte: now } }],
          },
          include: {
            delegator: {
              include: {
                roles: {
                  include: {
                    role: true,
                    department: {
                      select: { id: true, code: true, name: true },
                    },
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
        ? formatRoles(
            user.delegations_received.flatMap((d) => d.delegator.roles)
          )
        : [];

    req.user = {
      token,
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      roles: [...ownRoles, ...inheritedRoles],
      is_delegated: user.delegations_received.length > 0,
      delegated_by: user.delegations_received.map((d) => ({
        id: d.delegator.id,
        full_name: d.delegator.full_name,
        roles: d.delegator.roles.map((r) => r.role.name),
      })),
    };
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

export const authorize = (allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (req.user.roles.some((r) => r.role === Role.SUPER_ADMIN))
        return next();

      const hasPermission = req.user.roles.some((r) =>
        allowedRoles.includes(r.role as Role)
      );

      if (!hasPermission) {
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
export const authorizeSupply = (allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (req.user.roles.some((r) => r.role === Role.SUPER_ADMIN))
        return next();

      const hasSupplyPermission = req.user.roles.some(
        (r) => r.dept_code === 'SUPPLY' && allowedRoles.includes(r.role as Role)
      );

      if (!hasSupplyPermission) {
        throw new ForbiddenError(
          'This action requires Supply Department authority.'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export const requireRoles = authorize;
export const requireSupplyRoles = authorizeSupply;
