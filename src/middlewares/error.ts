import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

type ErrorResponse = {
  statusCode: number;
  message: string;
};

const logServerError = (err: unknown, req: Request, context: string) => {
  console.error(`[${context}] ${req.method} ${req.originalUrl}`, err);
};

const getPrismaErrorResponse = (err: unknown): ErrorResponse | null => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return { statusCode: 409, message: 'Duplicate value already exists' };
      case 'P2025':
        return { statusCode: 404, message: 'Record not found' };
      case 'P2003':
        return { statusCode: 400, message: 'Invalid related record' };
      default:
        if (err.code.startsWith('P10')) {
          return { statusCode: 503, message: 'Database unavailable' };
        }
        return { statusCode: 500, message: 'Database error' };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, message: 'Invalid database query input' };
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { statusCode: 503, message: 'Database unavailable' };
  }

  if (
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    return { statusCode: 500, message: 'Database error' };
  }

  return null;
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ZodError) {
    return res.status(422).json({
      status: 'unprocessable_entity',
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  const prismaErrorResponse = getPrismaErrorResponse(err);
  if (prismaErrorResponse) {
    logServerError(err, req, 'Prisma error');
    return res.status(prismaErrorResponse.statusCode).json({
      status: 'error',
      message: prismaErrorResponse.message,
    });
  }

  logServerError(err, req, 'Unhandled error');
  res.status(500).json({ status: 'error', message: 'Internal Server Error' });
};
