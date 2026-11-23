import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { requireCronAuth } from '../../src/routes/cron.routes.js';
import { orderService } from '../../src/modules/orders/order.service.js';
import { env } from '../../src/config/env.js';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Stock Reservation Expiry & COD Verification (Resolves P0-7)', () => {
  it('requireCronAuth blocks requests with missing or invalid CRON_SECRET with 401', () => {
    let calledNext = false;
    let receivedError: any = null;
    const next = (err?: any) => {
      calledNext = true;
      receivedError = err;
    };

    // Case 1: Missing secret header
    const reqMissing = {
      headers: {},
    } as Request;
    requireCronAuth(reqMissing, {} as Response, next);
    expect(calledNext).toBe(true);
    expect(receivedError?.statusCode).toBe(401);
    expect(receivedError?.code).toBe('UNAUTHORIZED');

    // Case 2: Invalid secret
    calledNext = false;
    receivedError = null;
    const reqInvalid = {
      headers: {
        authorization: 'Bearer wrong-secret-value-here',
      },
    } as Request;
    requireCronAuth(reqInvalid, {} as Response, next);
    expect(calledNext).toBe(true);
    expect(receivedError?.statusCode).toBe(401);

    // Case 3: Valid secret via Authorization: Bearer <CRON_SECRET>
    calledNext = false;
    receivedError = null;
    const reqValidBearer = {
      headers: {
        authorization: `Bearer ${env.CRON_SECRET}`,
      },
    } as Request;
    requireCronAuth(reqValidBearer, {} as Response, next);
    expect(calledNext).toBe(true);
    expect(receivedError).toBeUndefined();

    // Case 4: Valid secret via x-cron-secret header
    calledNext = false;
    receivedError = null;
    const reqValidHeader = {
      headers: {
        'x-cron-secret': env.CRON_SECRET,
      },
    } as Request;
    requireCronAuth(reqValidHeader, {} as Response, next);
    expect(calledNext).toBe(true);
    expect(receivedError).toBeUndefined();
  });

  it('orderService.expireStaleReservations executes cleanly and returns counts', async () => {
    const result = await orderService.expireStaleReservations(24);
    expect(result).toBeDefined();
    expect(typeof result.expiredOrdersCount).toBe('number');
    expect(typeof result.restoredItemsCount).toBe('number');
    expect(result.expiryHours).toBe(24);
  });

  it('rejects Cash on Delivery checkout requests with PAYMENT_METHOD_DISALLOWED', async () => {
    const basePayload = {
      shippingAddress: {
        addressLine: '14 Rosewood Lane',
        city: 'Chandigarh',
        state: 'Punjab',
        postalCode: '160019',
        country: 'India',
      },
      items: [{ serialNumber: 'CU-TEST-001', quantity: 1 }],
      paymentMethod: 'CASH_ON_DELIVERY' as const,
      idempotencyKey: 'idemp-cod-test-key-001',
      customer: { name: 'Customer', email: 'test@example.com', phone: '+919876543210' },
    };

    await expect(
      orderService.createOrder(basePayload),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'PAYMENT_METHOD_DISALLOWED',
    });
  });

  it('Migration 20261204000000 defines reservation release RPC and rate limiting table', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../supabase/migrations/20261204000000_user_submissions_and_distributed_rate_limiting.sql',
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists public.rate_limit_entries');
    expect(sql).toContain('create or replace function public.increment_rate_limit');
    expect(sql).toContain('create or replace function public.admin_release_expired_reservations');
    expect(sql).toContain('create table if not exists public.reviews');
    expect(sql).toContain('create table if not exists public.community_posts');
    expect(sql).toContain('status in (\'PENDING\', \'APPROVED\', \'REJECTED\')');
  });
});
