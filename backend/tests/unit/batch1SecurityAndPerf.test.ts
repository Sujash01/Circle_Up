import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { adminProductController } from '../../src/controllers/admin/adminProduct.controller.js';
import { BadRequestError } from '../../src/errors/AppError.js';

function createMockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('Batch 1: Backend Product Validation, Route Security & Migration Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects negative stock on product create with 400 VALIDATION_ERROR', async () => {
    const req = {
      body: { name: 'Shirt', price: 10000, stock: -3, category: 'womens-upperwear' },
    } as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await adminProductController.create(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-array ids on product bulk action with 400 VALIDATION_ERROR instead of 500 TypeError', async () => {
    const req = {
      body: { action: 'publish', ids: 'CU-001' },
    } as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await adminProductController.bulk(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-numeric page on product list with 400 VALIDATION_ERROR', async () => {
    const req = {
      query: { page: 'abc', limit: '20' },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await adminProductController.list(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty or malformed product IDs on softDelete, restore, and permanentDelete', async () => {
    for (const method of ['softDelete', 'restore', 'permanentDelete'] as const) {
      for (const badId of ['', '   ', 'CU-001/bad']) {
        const req = { params: { id: badId } } as unknown as Request;
        const res = createMockRes();
        const next = vi.fn() as unknown as NextFunction;

        await adminProductController[method](req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(err).toBeInstanceOf(BadRequestError);
        expect(err.code).toBe('VALIDATION_ERROR');
      }
    }
  });

  it('sanitizes raw Supabase error.message from ServiceUnavailableError in supabaseCatalog.service.ts', () => {
    const catalogPath = path.resolve(__dirname, '../../src/services/supabaseCatalog.service.ts');
    const source = fs.readFileSync(catalogPath, 'utf8');
    expect(source).not.toMatch(/new ServiceUnavailableError\([^)]*\$\{error\.message\}/);
  });

  it('enforces multer file count limit (files: 10) and rate limiter on /auth/change-password', () => {
    const routesPath = path.resolve(__dirname, '../../src/routes/admin/admin.routes.ts');
    const source = fs.readFileSync(routesPath, 'utf8');
    expect(source).toMatch(/files:\s*10/);
    expect(source).toMatch(/\/auth\/change-password[\s\S]*?adminAuthRateLimiter/);
  });

  it('uses explicit CREATE OR REPLACE FUNCTION definitions, concurrent idempotency, coupon limits, and missing RPCs in migration', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../supabase/migrations/20261214000000_batch1_crm_integrity_and_indexes.sql',
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // No fragile pg_get_functiondef() / replace() patching
    expect(sql).not.toMatch(/pg_get_functiondef\s*\(/);

    // Explicit function definitions & missing RPCs (Razorpay webhook/refund RPCs deferred)
    expect(sql).toContain('create or replace function public.admin_update_order_status(');
    expect(sql).not.toContain('create or replace function public.storefront_verify_razorpay_payment(');
    expect(sql).not.toContain('create or replace function public.storefront_finalize_order_refund(');
    expect(sql).not.toMatch(/(?:from|into|update|%rowtype)[^;]*razorpay_webhook_events/i);
    expect(sql).toContain('create or replace function public.process_storefront_checkout(');
    expect(sql).toContain("if p_payment_method not in ('RAZORPAY', 'ONLINE_UPI', 'WHATSAPP_UPI') then");
    expect(sql).toContain("if p_payment_method in ('COD', 'CASH_ON_DELIVERY') then");
    expect(sql).toContain('create or replace function public.admin_get_crm_customer_by_id(');
    expect(sql).toContain('create or replace function public.admin_get_daily_reconciliation_evidence(');
    expect(sql).toContain('create or replace function public.admin_cancel_order(');
    expect(sql).toContain('create or replace function public.admin_update_rental_booking(');
    expect(sql).toContain('create or replace function public.submit_rental_booking(');

    // Checkout concurrency (including rollback retry), duplicate serial aggregation, and coupon enforcement
    expect(sql).toContain('returning status into v_claimed_status');
    expect(sql).toContain('IDEMPOTENCY_KEY_IN_PROGRESS');
    expect(sql).toContain('IDEMPOTENCY_KEY_CLAIM_FAILED');
    expect(sql).toContain('while v_idem_attempt < 3 loop');
    expect(sql).toContain('if not found then\n      -- Concurrent holder rolled back');
    expect(sql).toContain('group by upper(trim(value->>\'serialNumber\'))');
    expect(sql).toContain('v_coupon.starts_at > pg_catalog.now()');
    expect(sql).toContain('v_coupon.per_customer_limit is not null');

    // Audit log check constraint preserves predecessor actions + new actions
    for (const action of [
      'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'CHANGE_PASSWORD',
      'ADMIN_USER_CREATE', 'ADMIN_USER_UPDATE', 'ADMIN_USER_DELETE',
      'EVENT_CREATE', 'EVENT_UPDATE', 'EVENT_DELETE',
      'RENTAL_CREATE', 'RENTAL_UPDATE', 'RENTAL_DELETE', 'RENTAL_BOOKING_UPDATE',
      'ORDER_FULFILLED', 'ORDER_REFUNDED', 'ORDER_PAYMENT_VERIFIED', 'ORDER_STATUS_UPDATE',
    ]) {
      expect(sql).toContain(`'${action}'`);
    }

    // Reconciliation RPC returns table matching admin_get_daily_reconciliation
    expect(sql).toMatch(/create or replace function public\.admin_get_daily_reconciliation_evidence[\s\S]*?returns table\s*\(/);
    expect(sql).toContain('from public.admin_get_daily_reconciliation(p_days) as r');

    // Rental booking enforces 14-day maximum without 15-30 day proration
    expect(sql).toContain('v_duration <= 0 or v_duration > 14');
    expect(sql).not.toContain('v_duration > 30');

    // Built-in pg_catalog.sha256 without pgcrypto digest dependency
    expect(sql).toContain('pg_catalog.sha256(');
    expect(sql).not.toMatch(/\bdigest\(/);

    // Ensures orders.promo_code exists before idx_orders_promo_code_upper_trim and checkout RPC, inside explicit transaction
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    const addPromoIdx = sql.indexOf('add column if not exists promo_code text');
    const promoIndexIdx = sql.indexOf('idx_orders_promo_code_upper_trim');
    const checkoutIdx = sql.indexOf('create or replace function public.process_storefront_checkout(');
    expect(addPromoIdx).toBeGreaterThan(-1);
    expect(addPromoIdx).toBeLessThan(promoIndexIdx);
    expect(addPromoIdx).toBeLessThan(checkoutIdx);

    // Indexes & RLS hardening
    expect(sql).toContain('idx_order_items_product_id');
    expect(sql).toContain('idx_products_name_trgm');
    expect(sql).toContain('idx_orders_status_created_at');
    expect(sql).toContain('order by oi.id asc');
    expect(sql).not.toMatch(/or auth\.role\(\) = 'authenticated'/i);
  });
});
