import { z } from 'zod';

/**
 * Standardized CircleUp API Error Detail schema
 */
export const apiErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string().optional(),
  issue: z.string().optional(),
  code: z.string().optional(),
});
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/**
 * Standardized CircleUp API Error Payload
 */
export const apiErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(apiErrorDetailSchema).optional(),
  requestId: z.string().optional(),
});
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;

/**
 * Standardized CircleUp API Error Response shape
 */
export const apiErrorResponseSchema = z.object({
  success: z.literal(false).optional(),
  error: apiErrorPayloadSchema,
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

/**
 * Standardized Pagination Envelope
 */
export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0).optional(),
  totalItems: z.number().int().min(0).optional(),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean().optional(),
  hasNextPage: z.boolean().optional(),
  hasPrevPage: z.boolean().optional(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  data: T;
  meta?: PaginationMeta;
}

export interface HealthCheckData {
  status: 'ok' | 'degraded';
  db: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
  uptimeSeconds: number;
  timestamp: string;
  environment: string;
}

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    pagination: paginationMetaSchema,
  });
}
