import { z } from 'zod';
import { moneyPaiseSchema } from './money.js';

export const couponTypeSchema = z.enum(['PERCENTAGE', 'FLAT']);
export type CouponType = z.infer<typeof couponTypeSchema>;

export const couponSchema = z.object({
  id: z.string(),
  code: z.string().min(2).max(30).toUpperCase().trim(),
  discountType: couponTypeSchema,
  value: z.number().positive(), // percentage (e.g. 10, 20) or flat amount in paise
  minOrderAmount: moneyPaiseSchema.default(0),
  maxDiscountAmount: moneyPaiseSchema.optional(),
  usageLimit: z.number().int().positive().optional(),
  usageCount: z.number().int().nonnegative().default(0),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
});
export type Coupon = z.infer<typeof couponSchema>;

export const couponValidatePayloadSchema = z.object({
  code: z.string().min(1).trim(),
  subtotalInPaise: moneyPaiseSchema,
});
export type CouponValidatePayload = z.infer<typeof couponValidatePayloadSchema>;

export const couponValidateResultSchema = z.object({
  valid: z.boolean(),
  code: z.string(),
  discountInPaise: moneyPaiseSchema,
  message: z.string(),
});
export type CouponValidateResult = z.infer<typeof couponValidateResultSchema>;

