import type { ApiErrorDetail } from '@circleup/shared';

/**
 * Operational application error with HTTP status code, machine-readable code,
 * and optional field-level details.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ApiErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: ApiErrorDetail[],
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', details?: ApiErrorDetail[]) {
    super(message, 400, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT', details?: ApiErrorDetail[]) {
    super(message, 409, code, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(
    message = 'Unprocessable entity',
    code = 'UNPROCESSABLE_ENTITY',
    details?: ApiErrorDetail[],
  ) {
    super(message, 422, code, details);
  }
}

export class LockedError extends AppError {
  constructor(message = 'Account temporarily locked', code = 'ACCOUNT_LOCKED') {
    super(message, 423, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    super(message, 429, code);
  }
}

