import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

type ErrorResponse = {
  statusCode: number;
  message: string;
  error?: string;
};

const logServerError = (err: unknown, req: Request, context: string) => {
  console.error(`[${context}] ${req.method} ${req.originalUrl}`, err);
};

const getPrismaErrorResponse = (err: unknown): ErrorResponse | null => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = Array.isArray(err.meta?.target)
          ? err.meta.target.join(', ')
          : typeof err.meta?.target === 'string'
            ? err.meta.target
            : undefined;
        return {
          statusCode: 409,
          message: 'Duplicate value already exists',
          error: target
            ? `Unique constraint failed on field: ${target}`
            : err.message,
        };
      }
      case 'P2025':
        return {
          statusCode: 404,
          message: 'Record not found',
          error:
            typeof err.meta?.cause === 'string' ? err.meta.cause : err.message,
        };
      case 'P2003': {
        const fieldName =
          typeof err.meta?.field_name === 'string'
            ? err.meta.field_name
            : undefined;
        return {
          statusCode: 400,
          message: 'Invalid related record',
          error: fieldName
            ? `Foreign key constraint failed on: ${fieldName}`
            : err.message,
        };
      }
      default:
        if (err.code.startsWith('P10')) {
          return {
            statusCode: 503,
            message: 'Database unavailable',
            error: err.message,
          };
        }
        return {
          statusCode: 500,
          message: 'Database error',
          error: err.message,
        };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      message: 'Invalid database query input',
      error: err.message,
    };
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return {
      statusCode: 503,
      message: 'Database unavailable',
      error: err.message,
    };
  }

  if (
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      statusCode: 500,
      message: 'Database error',
      error: err.message,
    };
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
    const issueSummary = err.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join(', ');

    return res.status(422).json({
      status: 'unprocessable_entity',
      message: 'Validation failed',
      error: issueSummary || err.message,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: number }).status === 400 &&
    'body' in err
  ) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON payload format',
      error: err.message,
    });
  }

  const prismaErrorResponse = getPrismaErrorResponse(err);
  if (prismaErrorResponse) {
    logServerError(err, req, 'Prisma error');
    return res.status(prismaErrorResponse.statusCode).json({
      status: 'error',
      message: prismaErrorResponse.message,
      ...(prismaErrorResponse.error
        ? { error: prismaErrorResponse.error }
        : {}),
    });
  }

  logServerError(err, req, 'Unhandled error');
  const errorMessage =
    err instanceof Error ? err.message : String(err ?? 'Unknown server error');
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
    error: errorMessage,
  });
};
