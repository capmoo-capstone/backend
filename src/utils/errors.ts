export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    // Maintains proper stack trace (Node.js specific)
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable') {
    super(message, 503);
  }
}

export const SSO_FAILURE_CODES = {
  REGISTRATION_PENDING: 'registration_pending',
  NOT_AUTHORIZED: 'not_authorized',
  ACCOUNT_INACTIVE: 'account_inactive',
  SSO_FAILED: 'sso_failed',
} as const;

export type SsoFailureCode =
  (typeof SSO_FAILURE_CODES)[keyof typeof SSO_FAILURE_CODES];

export class SsoAuthenticationError extends UnauthorizedError {
  constructor(
    public readonly code: SsoFailureCode,
    message: string
  ) {
    super(message);
  }
}
