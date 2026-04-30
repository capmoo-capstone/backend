import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../types/auth.type';
import { prisma } from '../config/prisma';
import { fetchAndFormatUserDetails } from '../services/auth.service';
import { OPS_DEPT_ID } from '../lib/constant';
import { getUserAuthCache, setUserAuthCache } from '../lib/auth-cache';

interface JwtPayload {
  id: string;
  username: string;
  full_name: string;
}

export const protect = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header missing');
    }

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedError(
        'Authorization header must start with Bearer'
      );
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;

    const userMeta = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { role_updated_at: true },
    });

    if (!userMeta) {
      throw new UnauthorizedError('User not found');
    }

    const cachedData = getUserAuthCache(decoded.id);
    if (cachedData && cachedData.cached_at >= userMeta.role_updated_at) {
      req.user = {
        token,
        ...decoded,
        ...cachedData,
      };
      return next();
    }

    const result = await fetchAndFormatUserDetails({ id: decoded.id });
    if (!result) throw new UnauthorizedError('User not found');

    const { user, authData } = result;

    setUserAuthCache(decoded.id, authData);

    req.user = {
      token,
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      ...authData,
    };

    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

const hasSuperAdminRole = (req: AuthenticatedRequest): boolean =>
  !!req.user?.roles.some((r) => r.role === UserRole.SUPER_ADMIN);

export const authorize = (allowedRoles: UserRole[] = []) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (hasSuperAdminRole(req)) return next();

      if (allowedRoles.length === 0) {
        throw new ForbiddenError('This action requires Super Admin authority.');
      }

      const hasPermission = req.user.roles.some((r) =>
        allowedRoles.includes(r.role as UserRole)
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

export const authorizeSupply = (allowedRoles: UserRole[] = []) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (hasSuperAdminRole(req)) return next();

      const hasSupplyPermission = req.user.roles.some(
        (r) =>
          r.dept_id === OPS_DEPT_ID &&
          (allowedRoles.length === 0 ||
            allowedRoles.includes(r.role as UserRole))
      );

      if (!hasSupplyPermission) {
        throw new ForbiddenError(
          allowedRoles.length === 0
            ? 'This action requires Supply Department access.'
            : 'This action requires one of the allowed Supply Department roles.'
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
export const requireSuperAdmin = authorize();
export const requireSupplyAccess = authorizeSupply();
