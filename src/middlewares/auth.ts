import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { Role } from '@prisma/client';
import { UserPayload } from '../lib/types';

type AuthPayload = Omit<UserPayload, 'id'> & {
  token: string;
};

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
    ) as UserPayload;

    const formatRoles = (orgRoles: any[]) =>
      orgRoles.map((r) => ({
        role: r.role.name,
        dept_id: r.department.id,
        dept_code: r.department.code,
        dept_name: r.department.name,
        unit_id: r.unit?.id || null,
        unit_name: r.unit?.name || null,
      }));
    
    
    req.user = { ...decoded, token, roles: { ...decoded.roles, own: formatRoles(decoded.roles.own), delegated: formatRoles(decoded.roles.delegated) } };
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

export const authorize = (allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (
        req.user.roles.own.some((r) => r.role === Role.SUPER_ADMIN) ||
        req.user.roles.delegated.some((r) => r.role === Role.SUPER_ADMIN)
      )
        return next();

      const hasPermission =
        req.user.roles.own.some((r) => allowedRoles.includes(r.role as Role)) ||
        req.user.roles.delegated.some((r) =>
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

      if (
        req.user.roles.own.some((r) => r.role === Role.SUPER_ADMIN) ||
        req.user.roles.delegated.some((r) => r.role === Role.SUPER_ADMIN)
      )
        return next();

      const hasSupplyPermission =
        req.user.roles.own.some(
          (r) =>
            r.dept_code === 'SUPPLY' && allowedRoles.includes(r.role as Role)
        ) ||
        req.user.roles.delegated.some(
          (r) =>
            r.dept_code === 'SUPPLY' && allowedRoles.includes(r.role as Role)
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
