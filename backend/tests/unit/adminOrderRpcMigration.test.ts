import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261130_admin_order_operations.sql'), 'utf8');
const statusPreservationMigration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261201000000_preserve_catalog_status_on_order_cancel.sql'), 'utf8');
const adminOrderService = readFileSync(resolve(process.cwd(), 'src/services/adminOrder.service.ts'), 'utf8');
const orderService = readFileSync(resolve(process.cwd(), 'src/modules/orders/order.service.ts'), 'utf8');

describe('Supabase admin order operation migration', () => {
  it('restricts admin mutation RPCs to the server service role', () => {
    expect([...migration.matchAll(/language plpgsql\s+security definer/gi)]).toHaveLength(2);
    expect([...migration.matchAll(/<> 'service_role'/gi)]).toHaveLength(2);
    expect(migration).toContain('to service_role');
    expect(migration).toContain('from public, anon, authenticated');
  });

  it('locks orders and products and restores inventory before committing cancellation', () => {
    expect(migration).toMatch(/where o\.order_number = upper\(trim\(p_order_ref\)\)[\s\S]*?for update;/i);
    expect(migration).toMatch(/order by oi\.serial_number[\s\S]*?for update;/i);
    expect(migration).toContain("set status = p_new_status");
    expect(migration).toContain("set stock = p.stock + v_item.quantity");
    expect(migration).toContain("'ORDER_INVENTORY_UNAVAILABLE'");
  });

  it('restores stock without republishing products that are archived or otherwise unavailable', () => {
    expect(statusPreservationMigration).toContain("status = case when p.status = 'SOLD_OUT' then 'ACTIVE' else p.status end");
    expect(statusPreservationMigration).not.toContain("status = 'ACTIVE'");
  });

  it('writes required payment audit data in the same RPC transaction', () => {
    const paymentRpc = migration.slice(migration.indexOf('create or replace function public.admin_mark_order_payment_received'));
    expect(paymentRpc).toContain("'ORDER_PAYMENT_VERIFIED'");
    expect(paymentRpc).toMatch(/update public\.orders[\s\S]*?insert into public\.activity_audit_logs[\s\S]*?return jsonb_build_object/i);
    expect(paymentRpc).toContain("p_actor_role <> 'owner'");
    expect(paymentRpc).toContain("v_order.payment_method = 'ONLINE_UPI'");
  });

  it('contains no legacy ORM order persistence or fallback in active order services', () => {
    expect(adminOrderService).not.toMatch(/runInTransaction|models\/Order|models\/Product|fallback to legacy/i);
    expect(orderService).not.toMatch(/models\/Order|Order\.find|runInTransaction/i);
  });
});
