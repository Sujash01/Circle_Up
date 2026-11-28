import { ConflictError, ServiceUnavailableError, NotFoundError } from '../errors/AppError.js';
import { getSupabaseAdminClient } from '../services/supabase.service.js';
import type { CouponRedemption } from '@circleup/shared';

export type CouponDiscountType = 'PERCENTAGE' | 'FLAT' | 'FREE_SHIPPING' | 'BOGO';
export interface CouponRecord {
  id: string; code: string; description: string; discountType: CouponDiscountType; value: number;
  minOrderAmount: number; maxDiscountAmount?: number; usageLimit?: number; usageCount: number;
  perCustomerLimit: number; isActive: boolean; startsAt?: string | null; expiresAt?: string | null;
  targetTier: string; appliesTo: string; applicableProductIds: string[];
  canCombineWithOrderDiscounts: boolean; canCombineWithShippingDiscounts: boolean;
  showInHeader: boolean; headerBannerText?: string; headerCtaLabel: string; headerPriority: number;
  autoApply: boolean; showInExitIntent: boolean; popupHeadline?: string; popupSubtext?: string;
  popupBadgeText?: string; targetPages: string[]; cooldownHours: number; captureEmailOrWhatsapp: boolean;
  assignedCustomerId?: string | null; assignedCustomerEmail?: string | null; issueReason?: string | null;
  createdAt: string; updatedAt: string; type: CouponDiscountType; maxDiscount?: number; minCartSubtotal: number;
}

type CouponInput = Partial<Omit<CouponRecord, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>> & { code?: string };
const unavailable = () => new ServiceUnavailableError('Coupon storage is temporarily unavailable. Please try again later.', 'COUPON_STORAGE_UNAVAILABLE');
const throwWriteError = (error: { code?: string }) => {
  if (error.code === '23505') throw new ConflictError('A coupon with this code already exists.', 'COUPON_CODE_EXISTS');
  throw unavailable();
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byIdentifier = (query: any, id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ? query.eq('id', id)
  : query.eq('code', id.trim().toUpperCase());

export function mapCouponRow(row: Record<string, unknown>): CouponRecord {
  const rawType = String(row.discount_type || 'PERCENTAGE').toUpperCase();
  const discountType = (rawType === 'FIXED' || rawType === 'FLAT_AMOUNT' ? 'FLAT' : rawType) as CouponDiscountType;
  return {
    id: String(row.id), code: String(row.code), description: String(row.description || ''), discountType,
    value: Number(row.discount_value ?? 0), minOrderAmount: Number(row.min_order_paise ?? 0),
    maxDiscountAmount: row.max_discount_paise == null ? undefined : Number(row.max_discount_paise),
    usageLimit: row.usage_limit == null ? undefined : Number(row.usage_limit), usageCount: Number(row.usage_count ?? 0),
    perCustomerLimit: Number(row.per_customer_limit ?? 1), isActive: Boolean(row.is_active),
    startsAt: row.starts_at == null ? undefined : String(row.starts_at), expiresAt: row.ends_at == null ? undefined : String(row.ends_at),
    targetTier: String(row.target_tier ?? 'ALL'), appliesTo: String(row.applies_to ?? 'ALL'),
    applicableProductIds: (row.applicable_product_ids as string[] | null) || [],
    canCombineWithOrderDiscounts: Boolean(row.can_combine_with_order_discounts),
    canCombineWithShippingDiscounts: Boolean(row.can_combine_with_shipping_discounts),
    showInHeader: Boolean(row.show_in_header), headerBannerText: row.header_banner_text == null ? undefined : String(row.header_banner_text),
    headerCtaLabel: String(row.header_cta_label || 'Copy Code'), headerPriority: Number(row.header_priority ?? 0),
    autoApply: Boolean(row.auto_apply), showInExitIntent: Boolean(row.show_in_exit_intent),
    popupHeadline: row.popup_headline == null ? undefined : String(row.popup_headline),
    popupSubtext: row.popup_subtext == null ? undefined : String(row.popup_subtext),
    popupBadgeText: row.popup_badge_text == null ? undefined : String(row.popup_badge_text),
    targetPages: (row.target_pages as string[] | null) || ['all'], cooldownHours: Number(row.cooldown_hours ?? 24),
    captureEmailOrWhatsapp: Boolean(row.capture_email_or_whatsapp),
    assignedCustomerId: row.assigned_customer_id == null ? null : String(row.assigned_customer_id),
    assignedCustomerEmail: row.assigned_customer_email == null ? null : String(row.assigned_customer_email),
    issueReason: row.issue_reason == null ? null : String(row.issue_reason),
    createdAt: String(row.created_at || ''), updatedAt: String(row.updated_at || ''),
    type: discountType,
    maxDiscount: row.max_discount_paise == null ? undefined : Number(row.max_discount_paise),
    minCartSubtotal: Number(row.min_order_paise ?? 0),
  };
}

function toRow(input: CouponInput): Record<string, unknown> {
  const fields: Record<string, keyof CouponInput> = {
    code: 'code', description: 'description', discount_type: 'discountType', discount_value: 'value',
    min_order_paise: 'minOrderAmount', max_discount_paise: 'maxDiscountAmount', usage_limit: 'usageLimit',
    per_customer_limit: 'perCustomerLimit', is_active: 'isActive', starts_at: 'startsAt', ends_at: 'expiresAt',
    target_tier: 'targetTier', applies_to: 'appliesTo', applicable_product_ids: 'applicableProductIds',
    can_combine_with_order_discounts: 'canCombineWithOrderDiscounts',
    can_combine_with_shipping_discounts: 'canCombineWithShippingDiscounts', show_in_header: 'showInHeader',
    header_banner_text: 'headerBannerText', header_cta_label: 'headerCtaLabel', header_priority: 'headerPriority',
    auto_apply: 'autoApply', show_in_exit_intent: 'showInExitIntent', popup_headline: 'popupHeadline',
    popup_subtext: 'popupSubtext', popup_badge_text: 'popupBadgeText', target_pages: 'targetPages',
    cooldown_hours: 'cooldownHours', capture_email_or_whatsapp: 'captureEmailOrWhatsapp',
    assigned_customer_id: 'assignedCustomerId', assigned_customer_email: 'assignedCustomerEmail',
    issue_reason: 'issueReason',
  };
  const row: Record<string, unknown> = {};
  for (const [column, field] of Object.entries(fields)) if (input[field] !== undefined) row[column] = input[field];
  if (row.code !== undefined) row.code = String(row.code).trim().toUpperCase();
  if (typeof row.assigned_customer_email === 'string') row.assigned_customer_email = row.assigned_customer_email.trim().toLowerCase();
  if (row.discount_type !== undefined) {
    const value = String(row.discount_type).trim().toUpperCase();
    row.discount_type = value === 'FIXED' || value === 'FLAT_AMOUNT' ? 'FLAT' : value;
  }
  return row;
}

export const couponRepository = {
  async listPromotions(): Promise<CouponRecord[]> {
    const { data, error } = await getSupabaseAdminClient().from('coupons')
      .select('code, description, discount_type, discount_value, is_active, starts_at, ends_at, usage_limit, usage_count, target_tier, applies_to, show_in_header, header_banner_text, header_cta_label, auto_apply, show_in_exit_intent, popup_headline, popup_subtext, popup_badge_text, target_pages, cooldown_hours, assigned_customer_id, assigned_customer_email')
      .eq('is_active', true)
      .or('show_in_header.eq.true,show_in_exit_intent.eq.true,auto_apply.eq.true')
      .order('header_priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) throw unavailable();
    return data.map(mapCouponRow);
  },
  async list(): Promise<CouponRecord[]> {
    const { data, error } = await getSupabaseAdminClient().from('coupons').select('*').order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) throw unavailable();
    return data.map((row) => mapCouponRow(row as Record<string, unknown>));
  },
  async findByCode(code: string): Promise<CouponRecord | null> {
    const { data, error } = await getSupabaseAdminClient().from('coupons').select('*').eq('code', code.trim().toUpperCase()).maybeSingle();
    if (error) throw unavailable();
    return data ? mapCouponRow(data as Record<string, unknown>) : null;
  },
  async create(input: CouponInput): Promise<CouponRecord> {
    const { data, error } = await getSupabaseAdminClient().from('coupons').insert(toRow(input)).select('*').single();
    if (error || !data) throwWriteError(error || {});
    return mapCouponRow(data as Record<string, unknown>);
  },
  async seedIfMissing(input: CouponInput): Promise<void> {
    const { error } = await getSupabaseAdminClient().from('coupons').upsert(toRow(input), { onConflict: 'code', ignoreDuplicates: true });
    if (error) throw unavailable();
  },
  async update(id: string, input: CouponInput): Promise<CouponRecord> {
    const client = getSupabaseAdminClient();
    const { data, error } = await byIdentifier(client.from('coupons').update(toRow(input)), id).select('*').maybeSingle();
    if (error) throw unavailable();
    if (!data) throw new NotFoundError('Coupon not found.', 'COUPON_NOT_FOUND');
    return mapCouponRow(data as Record<string, unknown>);
  },
  async delete(id: string): Promise<void> {
    const { data, error } = await byIdentifier(getSupabaseAdminClient().from('coupons').delete(), id).select('id').maybeSingle();
    if (error) throw unavailable();
    if (!data) throw new NotFoundError('Coupon not found.', 'COUPON_NOT_FOUND');
  },
  async countCustomerUsage(code: string, customerId?: string, customerEmail?: string): Promise<number> {
    if (!customerId && !customerEmail) return 0;
    const normalizedCode = code.trim().toUpperCase();
    const client = getSupabaseAdminClient();
    let query = client
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code', normalizedCode)
      .neq('status', 'CANCELLED');
    if (customerId && customerEmail) {
      query = query.or(`customer_id.eq.${customerId},customer_email.ilike.${customerEmail.trim().toLowerCase()}`);
    } else if (customerId) {
      query = query.eq('customer_id', customerId);
    } else if (customerEmail) {
      query = query.ilike('customer_email', customerEmail.trim().toLowerCase());
    }
    const { count, error } = await query;
    if (error) return 0;
    return Number(count ?? 0);
  },
  async listRedemptions(couponId?: string): Promise<CouponRedemption[]> {
    const client = getSupabaseAdminClient();
    let query = client
      .from('coupon_redemptions')
      .select('*')
      .order('redeemed_at', { ascending: false })
      .limit(200);
    if (couponId) {
      query = query.eq('coupon_id', couponId);
    }
    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      return data.map((row) => ({
        id: String(row.id),
        couponId: row.coupon_id == null ? null : String(row.coupon_id),
        couponCode: String(row.coupon_code),
        orderId: String(row.order_id),
        orderNumber: String(row.order_number),
        customerId: row.customer_id == null ? null : String(row.customer_id),
        customerEmail: row.customer_email == null ? null : String(row.customer_email),
        customerName: row.customer_name == null ? null : String(row.customer_name),
        discountPaise: Number(row.discount_paise ?? 0),
        orderTotalPaise: row.order_total_paise == null ? undefined : Number(row.order_total_paise),
        redeemedAt: String(row.redeemed_at),
      }));
    }

    // Fallback to orders table when coupon_redemptions migration has not yet been applied
    let fallbackQuery = client
      .from('orders')
      .select('id, order_number, customer_id, customer_email, customer_name, promo_code, discount_amount, total_amount, created_at')
      .not('promo_code', 'is', null)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false })
      .limit(200);
    if (couponId) {
      const coupon = await client.from('coupons').select('code').eq('id', couponId).maybeSingle();
      if (coupon.data?.code) {
        fallbackQuery = fallbackQuery.eq('promo_code', String(coupon.data.code).toUpperCase());
      }
    }
    const fallback = await fallbackQuery;
    if (fallback.error || !Array.isArray(fallback.data)) throw unavailable();
    return fallback.data.map((row) => ({
      id: String(row.id),
      couponId: couponId ?? null,
      couponCode: String(row.promo_code || ''),
      orderId: String(row.id),
      orderNumber: String(row.order_number || ''),
      customerId: row.customer_id == null ? null : String(row.customer_id),
      customerEmail: row.customer_email == null ? null : String(row.customer_email),
      customerName: row.customer_name == null ? null : String(row.customer_name),
      discountPaise: Number(row.discount_amount ?? 0),
      orderTotalPaise: Number(row.total_amount ?? 0),
      redeemedAt: String(row.created_at || ''),
    }));
  },
};
