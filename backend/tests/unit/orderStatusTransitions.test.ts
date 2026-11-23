import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  canTransitionOrderStatus,
  ORDER_STATUS_TRANSITIONS,
  orderStatusSchema,
  type OrderStatus,
} from '@circleup/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Canonical Order Status Transitions (P0-3 Hardening)', () => {
  const canonicalStatuses: OrderStatus[] = [
    'PENDING',
    'CONFIRMED',
    'PACKED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED',
    'REFUNDED',
  ];

  it('Schema contains all 10 canonical order statuses', () => {
    expect(Object.keys(ORDER_STATUS_TRANSITIONS)).toHaveLength(10);
    for (const status of canonicalStatuses) {
      expect(orderStatusSchema.safeParse(status).success).toBe(true);
      expect(ORDER_STATUS_TRANSITIONS[status]).toBeDefined();
    }
    expect(orderStatusSchema.safeParse('PROCESSING').success).toBe(false);
    expect(orderStatusSchema.safeParse('UNKNOWN_STATUS').success).toBe(false);
  });

  it('Allows valid standard forward progression transitions', () => {
    expect(canTransitionOrderStatus('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransitionOrderStatus('CONFIRMED', 'PACKED')).toBe(true);
    expect(canTransitionOrderStatus('PACKED', 'SHIPPED')).toBe(true);
    expect(canTransitionOrderStatus('SHIPPED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransitionOrderStatus('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
    expect(canTransitionOrderStatus('DELIVERED', 'RETURN_REQUESTED')).toBe(true);
    expect(canTransitionOrderStatus('RETURN_REQUESTED', 'RETURNED')).toBe(true);
    expect(canTransitionOrderStatus('RETURNED', 'REFUNDED')).toBe(true);
  });

  it('Allows direct jumps where business permits (e.g. Confirmed to Shipped, Shipped to Delivered)', () => {
    expect(canTransitionOrderStatus('CONFIRMED', 'SHIPPED')).toBe(true);
    expect(canTransitionOrderStatus('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransitionOrderStatus('RETURN_REQUESTED', 'REFUNDED')).toBe(true);
  });

  it('Allows cancellation from active pre-delivery states', () => {
    expect(canTransitionOrderStatus('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('PACKED', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('SHIPPED', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(true);
  });

  it('Rejects invalid transitions', () => {
    // Cannot cancel after delivery (must use return workflow)
    expect(canTransitionOrderStatus('DELIVERED', 'CANCELLED')).toBe(false);
    // Terminal states cannot transition to other states
    expect(canTransitionOrderStatus('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransitionOrderStatus('REFUNDED', 'DELIVERED')).toBe(false);
    // Cannot jump from Pending directly to Delivered
    expect(canTransitionOrderStatus('PENDING', 'DELIVERED')).toBe(false);
    // Cannot jump backwards from Delivered to Shipped
    expect(canTransitionOrderStatus('DELIVERED', 'SHIPPED')).toBe(false);
  });

  it('Migration file contains check constraint and updated RPC matching canonical rules', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../supabase/migrations/20261203000000_canonical_order_statuses_and_crm_aggregations.sql',
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
    for (const status of canonicalStatuses) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain('alter table public.orders add constraint orders_status_check');
    expect(sql).toContain('create or replace function public.admin_update_order_status');
    expect(sql).toContain('p_new_status in (\'CANCELLED\', \'RETURNED\')');
    expect(sql).toContain('p_new_status = \'REFUNDED\'');
  });
});
