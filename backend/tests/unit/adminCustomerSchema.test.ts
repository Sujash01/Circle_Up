import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const crmSchema = readFileSync(new URL('../../../supabase/migrations/20261120_admin_crm_full_schema.sql', import.meta.url), 'utf8').toLowerCase();
const orderSchema = readFileSync(new URL('../../../supabase/migrations/20261115_create_products_schema.sql', import.meta.url), 'utf8').toLowerCase();
const checkoutSchema = readFileSync(new URL('../../../supabase/migrations/20261121_checkout_infrastructure.sql', import.meta.url), 'utf8').toLowerCase();
const crmService = readFileSync(new URL('../../src/services/adminCustomer.service.ts', import.meta.url), 'utf8').toLowerCase();

describe('customer CRM schema compatibility', () => {
  it('uses the existing customer profile fields and customer/auth relationship', () => {
    for (const column of ['user_id uuid references auth.users(id)', 'full_name text not null', 'email text not null unique', 'saved_addresses jsonb', 'staff_notes text', 'marketing_opt_in_email boolean', 'marketing_opt_in_whatsapp boolean', 'garments_saved integer', 'co2_avoided_grams bigint', 'water_saved_liters bigint']) {
      expect(crmSchema).toContain(column);
    }
    expect(crmSchema).toContain('alter table public.customers enable row level security');
    expect(crmSchema).toContain('create policy "users can read own customer record"');
  });

  it('derives purchase totals from existing orders and order_items without adding schema', () => {
    expect(orderSchema).toContain('customer_id uuid references auth.users(id)');
    expect(orderSchema).toContain('customer_email text not null');
    expect(orderSchema).toContain('total_amount bigint not null check (total_amount >= 0)');
    expect(orderSchema).toContain('create table if not exists public.order_items');
    expect(checkoutSchema).toContain('idx_orders_customer_email');
    expect(crmService).toContain("from('customers')");
    expect(crmService).toContain("from('orders')");
    expect(crmService).not.toMatch(/mongoose|mock_customers|mongodb|models\/order/i);
  });
});
