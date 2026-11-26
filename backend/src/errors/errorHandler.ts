import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorDetail, ApiErrorResponse } from '@circleup/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from './AppError.js';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

function normalizeError(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        issue: issue.message,
      })),
    };
  }

  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    return {
      statusCode: 400,
      code: 'MALFORMED_JSON',
      message: 'Invalid JSON request payload',
    };
  }

  if (err && typeof err === 'object' && (err as { name?: string }).name === 'MulterError') {
    const multerErr = err as { code?: string; message?: string };
    let message = 'File upload failed.';
    let code = 'UPLOAD_ERROR';
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      message = 'Image exceeds maximum allowed size of 8MB.';
      code = 'FILE_TOO_LARGE';
    } else if (multerErr.code === 'LIMIT_FILE_COUNT' || multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Too many files uploaded or unexpected file field.';
      code = 'TOO_MANY_FILES';
    } else if (multerErr.message) {
      message = multerErr.message;
    }
    return {
      statusCode: 400,
      code,
      message,
    };
  }

  const fallbackMessage =
    env.NODE_ENV === 'production'
      ? 'An unexpected internal error occurred'
      : err instanceof Error
        ? err.message
        : 'Unknown internal error';

  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
  };
}

/**
 * Global Express error handling middleware serializing all errors into ApiErrorResponse.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
): void {
  const normalized = normalizeError(err);
  const requestId = req.requestId;

  if (normalized.statusCode >= 500) {
    logger.error({ err, requestId, path: req.originalUrl, method: req.method }, 'Unhandled error');
  } else {
    logger.warn(
      { code: normalized.code, statusCode: normalized.statusCode, requestId, path: req.originalUrl },
      normalized.message,
    );
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  });
}

