import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { UserRole } from '../../generated/prisma/client';

type AuthUser = {
  id: string;
  username: string;
  role: UserRole | null;
  full_name: string;
  unit_id: string | null;
};

type AuthenticatedRequest = Request & { user?: AuthUser };

const extractToken = (req: Request): string => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError('Authorization header missing');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Invalid authorization header format');
  }

  return token;
};

export const protect = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      username: string;
      role: UserRole | null;
      full_name: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        full_name: true,
        role: true,
        unit_id: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const authorize = (roles: UserRole[] = []) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      if (roles.length > 0) {
        if (!req.user.role || !roles.includes(req.user.role)) {
          throw new ForbiddenError('Insufficient permissions');
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export const requireRoles = authorize;
