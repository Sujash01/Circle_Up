import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrations = resolve(process.cwd(), '..', 'supabase', 'migrations');

describe('coupon checkout migration validation', () => {
  it('preserves the existing atomic checkout RPC and only adds the per-customer limit check', () => {
    const originalSql = readFileSync(resolve(migrations, '20261122_checkout_atomic_rpc.sql'), 'utf8').replace(/\r\n/g, '\n');
    const original = originalSql.slice(originalSql.indexOf('create or replace function public.process_storefront_checkout'));
    const replacement = readFileSync(resolve(migrations, '20261125_coupon_checkout_limits.sql'), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace('-- Enforces the existing per_customer_limit field in the atomic checkout transaction.\n', '')
      .replace('  v_coupon record;\n  v_coupon_customer_usage bigint := 0;', '  v_coupon record;');
    const perCustomerCheck = [
      '    if v_coupon.per_customer_limit is not null then',
      '      select count(*) into v_coupon_customer_usage',
      '      from public.orders as prior_order',
      '      where upper(trim(prior_order.promo_code)) = upper(trim(v_coupon.code))',
      '        and (',
      '          (p_customer_id is not null and prior_order.customer_id = p_customer_id)',
      "          or lower(prior_order.customer_email) = lower(trim(p_customer->>'email'))",
      '        );',
      '      if v_coupon_customer_usage >= v_coupon.per_customer_limit then',
      "        raise exception '%', jsonb_build_object(",
      "          'code', 'COUPON_REQUIRED',",
      "          'message', 'This promo code has reached its per-customer usage limit.'",
      '        )::text;',
      '      end if;',
      '    end if;',
      '',
      '',
    ].join('\n');
    expect(replacement).toContain(perCustomerCheck);
    expect(replacement.replace(perCustomerCheck, '')).toBe(original);
    expect(replacement).toMatch(/from public\.coupons[\s\S]*?for update;/);
    expect(replacement.indexOf('set usage_count = usage_count + 1')).toBeLessThan(replacement.indexOf('insert into public.orders'));
    expect(replacement).toContain('where key_hash = p_key_hash');
    expect(replacement).toContain('response_payload = v_response_payload');
  });

  it('adds customer restriction, redemption audit table, and atomic redemption logging in 20261216000000', () => {
    const sql = readFileSync(
      resolve(migrations, '20261216000000_coupons_customer_restriction_and_redemptions.sql'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(sql).toContain('add column if not exists assigned_customer_id uuid');
    expect(sql).toContain('add column if not exists assigned_customer_email text');
    expect(sql).toContain('add column if not exists issue_reason text');
    expect(sql).toContain('create table if not exists public.coupon_redemptions');
    expect(sql).toContain("'code', 'COUPON_NOT_ELIGIBLE'");
    expect(sql).toContain("'code', 'COUPON_UNSUPPORTED_SCOPE'");
    expect(sql).toContain('v_discount := (v_eligible_subtotal * v_coupon.discount_value) / 100;');
    expect(sql).not.toContain('pg_catalog.round((v_eligible_subtotal');
    expect(sql).toContain('if p_customer_id is null or p_customer_id <> v_coupon.assigned_customer_id then');
    expect(sql).toContain('insert into public.coupon_redemptions');
    expect(sql).toMatch(/from public\.coupons[\s\S]*?for update;/);
  });
});
