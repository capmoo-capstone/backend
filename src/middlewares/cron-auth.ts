import { NextFunction, Request, Response } from 'express';
import { ServiceUnavailableError, UnauthorizedError } from '../utils/errors';

const getBearerToken = (authorization?: string) => {
  if (!authorization) {
    throw new UnauthorizedError('Authorization header missing');
  }

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    throw new UnauthorizedError('Authorization header must start with Bearer');
  }

  const token = authorization.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('Authentication token missing');
  }

  return token;
};

export const protectCron = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      throw new ServiceUnavailableError('CRON_SECRET is not configured');
    }

    const token = getBearerToken(req.headers.authorization);
    if (token !== cronSecret) {
      throw new UnauthorizedError('Invalid cron secret');
    }

    next();
  } catch (error) {
    next(error);
  }
};
