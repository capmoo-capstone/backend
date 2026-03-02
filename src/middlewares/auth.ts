import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { UserRole } from '@prisma/client';
import { AuthPayload } from '../lib/types';
import { prisma } from '../config/prisma';
import { fetchAndFormatUserDetails } from '../service/auth.service';

interface JwtPayload {
  id: string;
  username: string;
  full_name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const userAuthCache = new Map<
  string,
  {
    roles: any[];
    is_delegated: boolean;
    delegated_by: any[];
    cached_at: Date;
  }
>();

export const protect = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    console.log(authHeader);
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

    const cachedData = userAuthCache.get(decoded.id);
    if (cachedData && cachedData.cached_at >= userMeta.role_updated_at) {
      req.user = {
        token,
        id: decoded.id,
        username: decoded.username,
        full_name: decoded.full_name,
        roles: cachedData.roles,
        is_delegated: cachedData.is_delegated,
        delegated_by: cachedData.delegated_by,
      };
      console.log(`Cache hit for user ${decoded.id}`);
      return next();
    }

    const result = await fetchAndFormatUserDetails({ id: decoded.id });
    if (!result) throw new UnauthorizedError('User not found');

    const { user, authData } = result;

    userAuthCache.set(decoded.id, {
      ...authData,
      cached_at: new Date(),
    });

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

export const authorize = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (req.user.roles.some((r) => r.role === UserRole.SUPER_ADMIN))
        return next();

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
export const authorizeSupply = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      if (req.user.roles.some((r) => r.role === UserRole.SUPER_ADMIN))
        return next();

      const hasSupplyPermission = req.user.roles.some(
        (r) =>
          r.dept_id === 'DEPT-SUP-OPS' &&
          allowedRoles.includes(r.role as UserRole)
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
