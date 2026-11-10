import type { Response } from 'express';
import type { ApiSuccessResponse, PaginationMeta } from '@circleup/shared';

/**
 * Serializes a standardized 200 OK JSON success envelope.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { message?: string; meta?: PaginationMeta; statusCode?: number } = {},
): Response<ApiSuccessResponse<T>> {
  const { message, meta, statusCode = 200 } = options;
  return res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    data,
    ...(meta ? { meta } : {}),
  });
}

/**
 * Serializes a standardized 201 Created JSON success envelope.
 */
export function sendCreated<T>(
  res: Response,
  data: T,
  message?: string,
): Response<ApiSuccessResponse<T>> {
  return sendSuccess(res, data, { message, statusCode: 201 });
}

