import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('audit compatibility migration', () => {
  it('adds the missing user agent and allows all roles and actions emitted by app code and SQL triggers', () => {
    const migration = readFileSync(new URL('../../../supabase/migrations/20261128_audit_logs_compatibility.sql', import.meta.url), 'utf8');
    expect(migration).toContain('add column if not exists user_agent text');
    for (const role of ['owner', 'admin', 'staff', 'system']) expect(migration).toContain(`'${role}'`);
    const actions = [
      'INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'CHANGE_PASSWORD',
      'COUPON_CREATE', 'COUPON_UPDATE', 'COUPON_DELETE', 'EVENT_CREATE', 'EVENT_UPDATE', 'EVENT_DELETE',
      'MEDIA_UPLOAD', 'ORDER_STATUS_UPDATE', 'ORDER_PAYMENT_VERIFIED', 'PRODUCT_CREATE', 'PRODUCT_UPDATE',
      'PRODUCT_DUPLICATE', 'PRODUCT_BULK_PUBLISH', 'PRODUCT_BULK_UNPUBLISH', 'PRODUCT_BULK_ARCHIVE',
      'PRODUCT_BULK_CHANGECATEGORY', 'PRODUCT_BULK_DELETE', 'PRODUCT_SOFT_DELETE', 'PRODUCT_RESTORE',
      'PRODUCT_PERMANENT_DELETE', 'SETTINGS_UPDATE', 'RENTAL_CREATE', 'RENTAL_UPDATE', 'RENTAL_DELETE',
    ];
    for (const action of actions) expect(migration).toContain(`'${action}'`);
    expect(migration).toContain('create or replace function public.fn_redact_audit_json');
    expect(migration).toContain('public.fn_redact_audit_json(to_jsonb(old))');
    expect(migration).toContain('public.fn_redact_audit_json(to_jsonb(new))');
  });
});
