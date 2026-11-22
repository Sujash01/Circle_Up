import { beforeEach, describe, expect, it, vi } from 'vitest';

const customerFixture = {
  id: 'c46b909a-e751-4c00-967e-8cdf1b41e4e2', user_id: '3d3e482f-430c-4ee2-b5d2-919e8d73d1d0',
  full_name: 'Test Customer', email: 'test@example.com', phone: '+919876543210', tier: 'COMMUNITY',
  saved_addresses: [{ addressLine: '12 Main Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001' }],
  staff_notes: 'Prefers email', marketing_opt_in_email: true, marketing_opt_in_whatsapp: false,
  garments_saved: 7, co2_avoided_grams: 1250, water_saved_liters: 4000, created_at: '2026-01-01T00:00:00.000Z',
};
const authOrder = {
  id: '8a175bf0-57b9-4c6f-9d4d-bae380d1d6a8', order_number: 'ORD-TEST-000001', customer_id: customerFixture.user_id,
  customer_name: 'Test Customer', customer_email: 'test@example.com', customer_phone: '+919876543210',
  total_amount: 12900, subtotal: 12900, discount_amount: 0, shipping_amount: 0, status: 'CONFIRMED',
  payment_status: 'PENDING', payment_method: 'COD', promo_code: null, notes: null,
  shipping_address: { addressLine: 'Latest Street', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001' },
  created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z',
  order_items: [{ id: 'item-1', serial_number: 'CU-1', name: 'Jacket', price: 12900, quantity: 1, image_url: '/jacket.jpg' }],
};
const guestOrder = {
  ...authOrder, id: 'c468f5a0-6ccf-42aa-a2f3-b8b320c2c5a6', order_number: 'ORD-GUEST-000001',
  customer_id: null, customer_name: 'Guest Buyer', customer_email: 'guest@example.com', customer_phone: '+919000000001',
  created_at: '2026-02-02T00:00:00.000Z', updated_at: '2026-02-02T00:00:00.000Z',
};

const db = vi.hoisted(() => ({
  customers: [] as Array<Record<string, any>>,
  orders: [] as Array<Record<string, any>>,
  errors: new Set<string>(),
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock('../../src/config/supabase.js', () => ({
  getSupabaseServiceClient: () => ({
    from(table: string) {
      const state: { table: string; values?: Record<string, unknown>; filters: Array<[string, unknown]>; ids?: string[] } = { table, filters: [] };
      const builder: any = {
        select: () => builder,
        order: () => builder,
        range: () => builder,
        in: (_field: string, ids: string[]) => { state.ids = ids; return builder; },
        eq: (field: string, value: unknown) => { state.filters.push([field, value]); return builder; },
        update: (values: Record<string, unknown>) => { state.values = values; db.updates.push({ table, values }); return builder; },
        maybeSingle: async () => {
          if (db.errors.has(table)) return { data: null, error: new Error('db unavailable') };
          const rows = table === 'customers' ? db.customers : db.orders;
          const row = rows.find((entry) => state.filters.every(([field, value]) => entry[field] === value));
          if (state.values && row) Object.assign(row, state.values);
          return { data: row || null, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          if (db.errors.has(table)) return Promise.resolve({ data: null, error: new Error('db unavailable') }).then(resolve, reject);
          let rows = table === 'customers' ? db.customers : db.orders;
          if (state.ids) rows = rows.filter((entry) => state.ids!.includes(String(entry.id)));
          rows = rows.map((entry) => ({ ...entry }));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

import { adminCustomerService } from '../../src/services/adminCustomer.service.js';

describe('Supabase-only customer CRM', () => {
  beforeEach(() => {
    db.customers = [{ ...customerFixture, saved_addresses: [...customerFixture.saved_addresses] }];
    db.orders = [{ ...authOrder, order_items: [...authOrder.order_items] }, { ...guestOrder, order_items: [...guestOrder.order_items] }];
    db.errors = new Set();
    db.updates = [];
  });

  it('lists persisted customers and exact-identity guest order groups with derived totals', async () => {
    const result = await adminCustomerService.listCustomers({ page: 1, limit: 10, search: 'example.com' });
    expect(result.meta.total).toBe(2);
    const registered = result.customers.find((customer) => customer.id === customerFixture.id)!;
    expect(registered).toMatchObject({ totalOrders: 1, totalSpendInPaise: 12900, tier: 'COMMUNITY', notes: 'Prefers email', city: 'Mumbai' });
    const guest = result.customers.find((customer) => customer.email === 'guest@example.com')!;
    expect(guest.id).toMatch(/^guest_[a-f0-9]{32}$/);
    expect(guest).toMatchObject({ totalOrders: 1, totalSpendInPaise: 12900, name: 'Guest Buyer' });
  });

  it('supports search, tier filtering, pagination and an actually empty database', async () => {
    const filtered = await adminCustomerService.listCustomers({ search: 'test', tier: 'COMMUNITY', page: 1, limit: 1 });
    expect(filtered.customers).toHaveLength(1);
    expect(filtered.meta.total).toBe(1);
    db.customers = [];
    db.orders = [];
    await expect(adminCustomerService.listCustomers({})).resolves.toMatchObject({ customers: [], meta: { total: 0 } });
  });

  it('returns order details, persisted impact fields, addresses and preferences', async () => {
    const result = await adminCustomerService.getCustomerById(customerFixture.id);
    expect(result.customer.totalSpendInPaise).toBe(12900);
    expect(result.orders[0]).toMatchObject({ orderNumber: 'ORD-TEST-000001', totalAmount: 12900, items: [{ serialNumber: 'CU-1', price: 12900 }] });
    expect(result.sustainabilityImpact).toEqual({ garmentsSaved: 7, co2AvoidedKg: 1.3, waterSavedLitres: 4000 });
    expect(result.savedAddresses).toEqual(customerFixture.saved_addresses);
    expect(result.marketingPreferences).toEqual({ email: true, whatsapp: false });
  });

  it('updates only supported CRM fields and confirms the persisted profile', async () => {
    const updated = await adminCustomerService.updateCustomer(customerFixture.id, {
      name: 'Updated Customer', notes: 'Call before sending', tier: 'VIP', marketingOptInEmail: false,
      savedAddresses: [{ addressLine: 'New Address', city: 'Delhi' }],
    });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].values).toMatchObject({ full_name: 'Updated Customer', staff_notes: 'Call before sending', tier: 'VIP', marketing_opt_in_email: false });
    expect(updated.customer).toMatchObject({ name: 'Updated Customer', notes: 'Call before sending', tier: 'VIP' });
    expect(updated.marketingPreferences.email).toBe(false);
  });

  it('does not report profile update success when Supabase rejects the write', async () => {
    db.errors.add('customers');
    await expect(adminCustomerService.updateCustomer(customerFixture.id, { notes: 'Must persist' }))
      .rejects.toMatchObject({ statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
  });

  it('retrieves guest history through the exact normalized email identity', async () => {
    const listed = await adminCustomerService.listCustomers({ search: 'guest@example.com' });
    const guest = listed.customers[0];
    const detail = await adminCustomerService.getCustomerById(guest.id);
    expect(detail.customer.email).toBe('guest@example.com');
    expect(detail.orders).toHaveLength(1);
    expect(detail.orders[0].orderNumber).toBe('ORD-GUEST-000001');
  });

  it('fails closed when customer or order reads fail and never falls back to MongoDB', async () => {
    db.errors.add('customers');
    await expect(adminCustomerService.listCustomers({})).rejects.toMatchObject({ statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
    db.errors.clear();
    db.errors.add('orders');
    await expect(adminCustomerService.listCustomers({})).rejects.toMatchObject({ statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
  });
});
