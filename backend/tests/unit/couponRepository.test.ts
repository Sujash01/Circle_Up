import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const query = { table: '', action: 'select', values: {} as Record<string, unknown>, filters: {} as Record<string, unknown>, orderBy: '' };
  let failure: { message: string; code?: string } | null = null;
  const builder: Record<string, (...args: any[]) => any> = {};
  const result = () => {
    if (failure) return { data: null, error: failure };
    const matching = rows.filter((row) => Object.entries(query.filters).every(([key, value]) => row[key] === value));
    if (query.action === 'insert') {
      const row = { id: 'c5ebf5be-1487-4caa-8847-1cb32e2138a1', usage_count: 0, per_customer_limit: 1, is_active: true, ...query.values, created_at: '2026-11-22T00:00:00.000Z', updated_at: '2026-11-22T00:00:00.000Z' };
      rows.push(row); return { data: { ...row }, error: null };
    }
    if (query.action === 'update') {
      const row = matching[0]; if (!row) return { data: null, error: null };
      Object.assign(row, query.values); return { data: { ...row }, error: null };
    }
    if (query.action === 'delete') {
      if (!matching.length) return { data: null, error: null };
      const index = rows.indexOf(matching[0]!); const [deleted] = rows.splice(index, 1); return { data: { id: deleted?.id }, error: null };
    }
    return { data: query.orderBy ? [...matching].reverse().map((row) => ({ ...row })) : matching[0] ? { ...matching[0] } : null, error: null };
  };
  Object.assign(builder, {
    select: () => builder, order: (column: string) => { query.orderBy = column; return builder; },
    eq: (column: string, value: unknown) => { query.filters[column] = value; return builder; },
    insert: (values: Record<string, unknown>) => { query.action = 'insert'; query.values = values; return builder; },
    update: (values: Record<string, unknown>) => { query.action = 'update'; query.values = values; return builder; },
    delete: () => { query.action = 'delete'; return builder; },
    upsert: (values: Record<string, unknown>, options: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const duplicate = rows.find((row) => row[options.onConflict || 'code'] === values[options.onConflict || 'code']);
      if (!duplicate) { query.action = 'insert'; query.values = values; }
      return builder;
    },
    single: async () => result(), maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  });
  const from = vi.fn((table: string) => { query.table = table; query.action = 'select'; query.values = {}; query.filters = {}; query.orderBy = ''; return builder; });
  return {
    rows, query, from,
    reset: () => { rows.splice(0); failure = null; query.table = ''; query.action = 'select'; query.values = {}; query.filters = {}; query.orderBy = ''; },
    fail: (error: { message: string; code?: string } | null) => { failure = error; },
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: db.from }) }));

import { env } from '../../src/config/env.js';
import { ConflictError, ServiceUnavailableError } from '../../src/errors/AppError.js';
import { couponRepository } from '../../src/repositories/coupon.repository.js';
import { resetSupabaseClientForTesting } from '../../src/services/supabase.service.js';

const oldConfig = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  Reflect.set(env, 'SUPABASE_URL', 'https://coupon-tests.supabase.co');
  Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', 'test-coupon-service-role-key-long-enough');
  resetSupabaseClientForTesting(); db.reset();
});
afterEach(() => {
  resetSupabaseClientForTesting();
  Reflect.set(env, 'SUPABASE_URL', oldConfig.url);
  Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', oldConfig.key);
});

describe('Supabase coupon repository', () => {
  it('maps existing SQL fields and normalizes legacy FIXED naming without changing values', async () => {
    db.rows.push({ id: 'c5ebf5be-1487-4caa-8847-1cb32e2138a1', code: 'SAVE5', description: 'Existing', discount_type: 'FIXED', discount_value: 2500, min_order_paise: 10000, max_discount_paise: 3000, usage_limit: 10, usage_count: 2, per_customer_limit: 1, is_active: true, starts_at: null, ends_at: null, target_tier: 'ALL', applies_to: 'ALL', applicable_product_ids: [], can_combine_with_order_discounts: false, can_combine_with_shipping_discounts: false, show_in_header: true, header_banner_text: 'Save', header_cta_label: 'Shop', header_priority: 2, auto_apply: false, show_in_exit_intent: true, popup_headline: 'Finds', popup_subtext: 'Copy', popup_badge_text: 'Offer', target_pages: ['all'], cooldown_hours: 24, capture_email_or_whatsapp: false, created_at: '2026-11-22T00:00:00.000Z', updated_at: '2026-11-22T00:00:00.000Z' });
    const coupon = await couponRepository.findByCode('save5');
    expect(coupon).toMatchObject({ discountType: 'FLAT', type: 'FLAT', value: 2500, minOrderAmount: 10000, minCartSubtotal: 10000, maxDiscountAmount: 3000, perCustomerLimit: 1, showInHeader: true, showInExitIntent: true });
    expect(db.from).toHaveBeenCalledWith('coupons');
  });

  it('writes, updates and deletes only Supabase rows', async () => {
    const created = await couponRepository.create({ code: 'new10', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 0 });
    expect(created.code).toBe('NEW10');
    expect(db.rows[0]).toMatchObject({ code: 'NEW10', discount_type: 'PERCENTAGE', discount_value: 10 });
    await couponRepository.update(created.id, { isActive: false });
    expect(db.rows[0]?.is_active).toBe(false);
    await couponRepository.delete(created.id);
    expect(db.rows).toHaveLength(0);
  });

  it('does not report successful reads or writes when Supabase fails', async () => {
    db.fail({ message: 'database offline' });
    await expect(couponRepository.list()).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(couponRepository.create({ code: 'NEW10', discountType: 'PERCENTAGE', value: 10 })).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('reports duplicate codes as conflicts', async () => {
    db.fail({ message: 'duplicate', code: '23505' });
    await expect(couponRepository.create({ code: 'NEW10', discountType: 'PERCENTAGE', value: 10 })).rejects.toBeInstanceOf(ConflictError);
  });
});
