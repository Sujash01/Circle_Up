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
  assignedCustomerId: z.string().uuid().nullable().optional(),
  assignedCustomerEmail: z.string().email().nullable().optional(),
  issueReason: z.string().max(300).nullable().optional(),
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
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
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
  assignedCustomerId: z.string().uuid().nullable().optional(),
  assignedCustomerEmail: z.string().trim().email().nullable().optional(),
  issueReason: z.string().trim().max(300).nullable().optional(),
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

function validateCouponRules(
  data: { discountType?: string; value?: number; startsAt?: string | null; expiresAt?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.discountType === 'PERCENTAGE' && typeof data.value === 'number' && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Percentage discount must be between 1% and 100%.',
    });
  }
  if (data.discountType === 'FLAT' && typeof data.value === 'number' && data.value < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Flat discount must be at least ₹1 (100 paise).',
    });
  }
  if (data.startsAt && data.expiresAt && new Date(data.expiresAt) <= new Date(data.startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresAt'],
      message: 'Expiry date must be after the start date.',
    });
  }
}

export const couponAdminCreateSchema = z.preprocess(
  normalizeCouponAliases,
  couponAdminFieldsSchema.superRefine(validateCouponRules),
);
export const couponAdminUpdateSchema = z.preprocess(
  normalizeCouponAliases,
  couponAdminFieldsSchema.partial().strict()
    .refine((value) => Object.keys(value).length > 0, 'At least one coupon field must be provided')
    .superRefine(validateCouponRules),
);

export const customerCouponIssueSchema = z.object({
  customerId: z.string().uuid(),
  code: z.string().trim().min(3).max(30).toUpperCase().regex(/^[A-Z0-9_-]+$/, 'Code may only contain letters, numbers, hyphens, and underscores.').optional(),
  discountType: couponTypeSchema,
  value: z.number().int().positive(),
  maxDiscountAmount: moneyPaiseSchema.nullable().optional(),
  minOrderAmount: moneyPaiseSchema.default(0),
  usageLimit: z.number().int().min(1).max(10).default(1),
  perCustomerLimit: z.number().int().min(1).max(10).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  issueReason: z.string().trim().min(3, 'Please provide a reason for issuing this coupon.').max(300),
  isActive: z.boolean().default(true),
}).strict().superRefine((data, ctx) => {
  if (data.discountType === 'PERCENTAGE' && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Percentage discount must be between 1% and 100%.',
    });
  }
});
export type CustomerCouponIssueInput = z.infer<typeof customerCouponIssueSchema>;

export const couponRedemptionSchema = z.object({
  id: z.string(),
  couponId: z.string().nullable().optional(),
  couponCode: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  customerId: z.string().nullable().optional(),
  customerEmail: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  discountPaise: z.number().int().nonnegative(),
  orderTotalPaise: z.number().int().nonnegative().optional(),
  redeemedAt: z.string(),
});
export type CouponRedemption = z.infer<typeof couponRedemptionSchema>;

export const couponValidatePayloadSchema = z.object({
  code: z.string().min(1).trim(),
  subtotalInPaise: moneyPaiseSchema,
  customerId: z.string().uuid().optional(),
  customerEmail: z.string().trim().email().optional(),
  productIds: z.array(z.string().min(1)).optional(),
});
export type CouponValidatePayload = z.infer<typeof couponValidatePayloadSchema>;

export const couponValidateResultSchema = z.object({
  valid: z.boolean(),
  code: z.string(),
  discountInPaise: moneyPaiseSchema,
  message: z.string(),
});
export type CouponValidateResult = z.infer<typeof couponValidateResultSchema>;

