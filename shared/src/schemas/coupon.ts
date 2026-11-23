import { z } from 'zod';
import { moneyPaiseSchema } from './money.js';

export const couponTypeSchema = z.enum(['PERCENTAGE', 'FLAT']);
export type CouponType = z.infer<typeof couponTypeSchema>;

export const couponSchema = z.object({
  id: z.string(),
  code: z.string().min(2).max(30).toUpperCase().trim(),
  discountType: couponTypeSchema,
  value: z.number().int().nonnegative(), // percentage (e.g. 10, 20) or flat amount in the stored currency unit
  minOrderAmount: moneyPaiseSchema.default(0),
  maxDiscountAmount: moneyPaiseSchema.optional(),
  usageLimit: z.number().int().positive().optional(),
  usageCount: z.number().int().nonnegative().default(0),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
  perCustomerLimit: z.number().int().positive().default(1),
  targetTier: z.enum(['ALL', 'VIP', 'REGULAR', 'NEW', 'COMMUNITY']).default('ALL'),
  appliesTo: z.enum(['ALL', 'SPECIFIC_PRODUCTS', 'SPECIFIC_COLLECTIONS']).default('ALL'),
  applicableProductIds: z.array(z.string()).default([]),
  canCombineWithOrderDiscounts: z.boolean().default(false),
  canCombineWithShippingDiscounts: z.boolean().default(false),
  showInHeader: z.boolean().default(false),
  headerBannerText: z.string().optional(),
  headerCtaLabel: z.string().default('Copy Code'),
  headerPriority: z.number().int().default(0),
  autoApply: z.boolean().default(false),
  showInExitIntent: z.boolean().default(false),
  popupHeadline: z.string().optional(),
  popupSubtext: z.string().optional(),
  popupBadgeText: z.string().optional(),
  targetPages: z.array(z.string()).default(['all']),
  cooldownHours: z.number().int().positive().default(24),
  captureEmailOrWhatsapp: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Coupon = z.infer<typeof couponSchema>;

const couponAdminFieldsSchema = z.object({
  code: z.string().min(2).max(30).toUpperCase().trim(),
  discountType: couponTypeSchema,
  value: z.number().int().nonnegative(),
  minOrderAmount: moneyPaiseSchema.default(0),
  maxDiscountAmount: moneyPaiseSchema.optional(),
  usageLimit: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().default(1),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  description: z.string().max(2000).optional(),
  targetTier: z.enum(['ALL', 'VIP', 'REGULAR', 'NEW', 'COMMUNITY']).default('ALL'),
  appliesTo: z.enum(['ALL', 'SPECIFIC_PRODUCTS', 'SPECIFIC_COLLECTIONS']).default('ALL'),
  applicableProductIds: z.array(z.string()).default([]),
  canCombineWithOrderDiscounts: z.boolean().default(false),
  canCombineWithShippingDiscounts: z.boolean().default(false),
  showInHeader: z.boolean().default(false), headerBannerText: z.string().optional(),
  headerCtaLabel: z.string().default('Copy Code'), headerPriority: z.number().int().default(0),
  autoApply: z.boolean().default(false), showInExitIntent: z.boolean().default(false),
  popupHeadline: z.string().optional(), popupSubtext: z.string().optional(), popupBadgeText: z.string().optional(),
  targetPages: z.array(z.string()).default(['all']), cooldownHours: z.number().int().positive().default(24),
  captureEmailOrWhatsapp: z.boolean().default(false),
}).strict();

function normalizeCouponAliases(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const output = { ...input };
  output.discountType ??= input.type;
  output.value ??= input.discountValue;
  output.minOrderAmount ??= input.minCartSubtotal;
  output.maxDiscountAmount ??= input.maxDiscount;
  delete output.type;
  delete output.discountValue;
  delete output.minCartSubtotal;
  delete output.maxDiscount;
  if (typeof output.discountType === 'string') {
    const type = output.discountType.toUpperCase();
    output.discountType = type === 'FIXED' || type === 'FLAT_AMOUNT' ? 'FLAT' : type;
  }
  return output;
}

export const couponAdminCreateSchema = z.preprocess(normalizeCouponAliases, couponAdminFieldsSchema);
export const couponAdminUpdateSchema = z.preprocess(
  normalizeCouponAliases,
  couponAdminFieldsSchema.partial().strict()
    .refine((value) => Object.keys(value).length > 0, 'At least one coupon field must be provided'),
);

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

