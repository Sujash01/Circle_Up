import crypto from 'node:crypto';
import type { Customer, CustomerTier, IOrder, IShippingAddress } from '@circleup/shared';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';

type CustomerRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  tier: string | null;
  saved_addresses: unknown;
  staff_notes: string | null;
  marketing_opt_in_email: boolean | null;
  marketing_opt_in_whatsapp: boolean | null;
  garments_saved: number | null;
  co2_avoided_grams: number | null;
  water_saved_liters: number | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  promo_code: string | null;
  notes: string | null;
  shipping_address: unknown;
  created_at: string;
  updated_at: string;
  order_items?: Array<Record<string, unknown>>;
};

type OrderSummary = {
  count: number;
  spend: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
  latestOrder?: OrderRow;
  rows: OrderRow[];
};

const UNAVAILABLE = () => new ServiceUnavailableError('Customer CRM database is unavailable.', 'DATABASE_UNAVAILABLE');
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const userKey = (id: string) => `user:${id}`;
const guestKey = (email: string) => `guest:${normalizeEmail(email)}`;
const guestId = (email: string) => `guest_${crypto.createHash('md5').update(normalizeEmail(email)).digest('hex')}`;
const legacyGuestId = (email: string) => `guest_${crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 32)}`;

function parseAddress(value: unknown): Partial<IShippingAddress> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const address = value as Record<string, unknown>;
  const stringField = (key: string) => typeof address[key] === 'string' ? address[key] as string : undefined;
  return {
    addressLine: stringField('addressLine'),
    city: stringField('city'),
    state: stringField('state'),
    postalCode: stringField('postalCode'),
    country: stringField('country'),
    landmark: stringField('landmark'),
  };
}

function firstSavedAddress(value: unknown): Partial<IShippingAddress> {
  if (!Array.isArray(value)) return {};
  return parseAddress(value.find((entry) => entry && typeof entry === 'object'));
}

function calculateTier(spend: number, count: number): CustomerTier {
  if (spend >= 1_000_000) return 'VIP';
  if (count >= 2) return 'REGULAR';
  return 'NEW';
}

function mapCustomer(row: CustomerRow | undefined, summary: OrderSummary, fallback?: { userId?: string; email: string; name: string; phone: string }) {
  const latestOrder = summary.latestOrder;
  const savedAddress = firstSavedAddress(row?.saved_addresses);
  const latestAddress = parseAddress(latestOrder?.shipping_address);
  const address = latestOrder ? latestAddress : savedAddress;
  const email = row?.email || fallback?.email || '';
  const customer: Customer = {
    id: row?.id || (fallback?.userId ? `auth_${fallback.userId}` : guestId(email)),
    name: row?.full_name || latestOrder?.customer_name || fallback?.name || 'Customer',
    email,
    phone: row?.phone || latestOrder?.customer_phone || fallback?.phone || '',
    totalOrders: summary.count,
    totalSpendInPaise: summary.spend,
    firstOrderAt: summary.firstOrderAt,
    lastOrderAt: summary.lastOrderAt,
    tier: isCustomerTier(row?.tier) ? row!.tier as CustomerTier : calculateTier(summary.spend, summary.count),
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    addressLine: address.addressLine,
    notes: row?.staff_notes || undefined,
    savedAddresses: Array.isArray(row?.saved_addresses) ? row!.saved_addresses.map((entry) => parseAddress(entry)) : [],
    marketingOptInEmail: row?.marketing_opt_in_email ?? false,
    marketingOptInWhatsapp: row?.marketing_opt_in_whatsapp ?? false,
    garmentsSaved: row?.garments_saved ?? 0,
    co2AvoidedGrams: row?.co2_avoided_grams ?? 0,
    waterSavedLitres: row?.water_saved_liters ?? 0,
    createdAt: row?.created_at || summary.firstOrderAt,
  };
  return {
    customer,
    sustainabilityImpact: {
      garmentsSaved: row?.garments_saved ?? 0,
      co2AvoidedKg: Number(((row?.co2_avoided_grams ?? 0) / 1000).toFixed(1)),
      waterSavedLitres: row?.water_saved_liters ?? 0,
    },
    savedAddresses: customer.savedAddresses ?? [],
    marketingPreferences: {
      email: row?.marketing_opt_in_email ?? false,
      whatsapp: row?.marketing_opt_in_whatsapp ?? false,
    },
    userId: row?.user_id || fallback?.userId || null,
  };
}

function isCustomerTier(value: unknown): value is CustomerTier {
  return value === 'NEW' || value === 'REGULAR' || value === 'VIP' || value === 'COMMUNITY';
}

async function fetchAllRows<T>(table: 'customers' | 'orders', select: string): Promise<T[]> {
  const client = getSupabaseServiceClient();
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const query = client.from(table).select(select).order('created_at', { ascending: true }).range(offset, offset + pageSize - 1);
    let result: { data: unknown[] | null; error: unknown | null };
    try { result = await query as unknown as { data: unknown[] | null; error: unknown | null }; }
    catch { throw UNAVAILABLE(); }
    const { data, error } = result;
    if (error) throw UNAVAILABLE();
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadData() {
  const [customers, orders] = await Promise.all([
    fetchAllRows<CustomerRow>('customers', 'id,user_id,full_name,email,phone,tier,saved_addresses,staff_notes,marketing_opt_in_email,marketing_opt_in_whatsapp,garments_saved,co2_avoided_grams,water_saved_liters,created_at'),
    fetchAllRows<OrderRow>('orders', 'id,order_number,customer_id,customer_name,customer_email,customer_phone,total_amount,subtotal,discount_amount,shipping_amount,status,payment_status,payment_method,shipping_address,created_at,updated_at'),
  ]);
  const registered = new Map<string, CustomerRow>();
  const byEmail = new Map<string, CustomerRow>();
  for (const customer of [...customers].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    for (const id of [customer.id, customer.user_id]) {
      if (id && !registered.has(id)) registered.set(id, customer);
    }
    const email = normalizeEmail(customer.email);
    if (!byEmail.has(email)) byEmail.set(email, customer);
  }
  const summaries = new Map<string, OrderSummary>();
  for (const order of orders) {
    const profile = order.customer_id ? registered.get(order.customer_id) : byEmail.get(normalizeEmail(order.customer_email));
    const key = profile ? profile.id : order.customer_id ? userKey(order.customer_id) : guestKey(order.customer_email);
    const summary = summaries.get(key) || { count: 0, spend: 0, rows: [] };
    const isPaid = order.payment_status === 'PAID';
    const isCancelledOrRefunded =
      order.status === 'CANCELLED' ||
      order.status === 'REFUNDED' ||
      order.payment_status === 'REFUNDED';
    const isEligiblePaidSpend = isPaid && !isCancelledOrRefunded;
    const isEligibleOrder = order.status !== 'CANCELLED';

    if (isEligibleOrder) {
      summary.count += 1;
    }
    if (isEligiblePaidSpend) {
      summary.spend += Number(order.total_amount || 0);
    }
    summary.rows.push(order);
    if (!summary.firstOrderAt || order.created_at < summary.firstOrderAt) summary.firstOrderAt = order.created_at;
    if (!summary.lastOrderAt || order.created_at >= summary.lastOrderAt) {
      summary.lastOrderAt = order.created_at;
      summary.latestOrder = order;
    }
    summaries.set(key, summary);
  }
  return { customers, orders, summaries };
}

function paginate<T>(rows: T[], query: { page?: unknown; limit?: unknown }) {
  const { page, limit, skip } = parsePagination(query);
  const total = rows.length;
  return { rows: rows.slice(skip, skip + limit), meta: buildPaginationMeta(page, limit, total) };
}

function mapOrder(order: OrderRow): IOrder {
  const address = parseAddress(order.shipping_address);
  const orderItems = order.order_items || [];
  return {
    id: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id || undefined,
    customer: { name: order.customer_name, email: order.customer_email, phone: order.customer_phone || '' },
    shippingAddress: {
      addressLine: address.addressLine || '', city: address.city || '', state: address.state || '',
      postalCode: address.postalCode || '', country: address.country || 'India', landmark: address.landmark,
    },
    items: orderItems.map((item) => ({
      serialNumber: String(item.serial_number || ''), name: String(item.name || ''),
      price: Number(item.price || 0), quantity: Number(item.quantity || 0),
      size: typeof item.size === 'string' ? item.size : undefined,
      image: typeof item.image_url === 'string' ? item.image_url : undefined,
      slug: typeof item.slug === 'string' ? item.slug : undefined,
    })),
    subtotal: Number(order.subtotal || 0), discount: Number(order.discount_amount || 0),
    deliveryFee: Number(order.shipping_amount || 0), totalAmount: Number(order.total_amount || 0),
    status: order.status as IOrder['status'], paymentMethod: order.payment_method as IOrder['paymentMethod'],
    paymentStatus: order.payment_status as IOrder['paymentStatus'], notes: order.notes || undefined,
    createdAt: order.created_at, updatedAt: order.updated_at,
  };
}

interface CustomerListMeta {
  page: number;
  limit: number;
  totalPages: number;
  total?: number;
  totalItems?: number;
  hasNext?: boolean;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export const adminCustomerService = {
  async listCustomers(query: { page?: unknown; limit?: unknown; search?: string; tier?: string }) {
    const { page, limit } = parsePagination(query);
    const client = getSupabaseServiceClient();

    // Prefer server-side SQL aggregation and pagination via admin_get_crm_customers RPC (Resolves P1-5)
    try {
      const rpcResult = await (client as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: { customers?: unknown[]; meta?: CustomerListMeta }; error?: unknown }> }).rpc('admin_get_crm_customers', {
        p_page: page,
        p_limit: limit,
        p_search: query.search?.trim() || null,
        p_tier: query.tier && query.tier !== 'all' ? query.tier : null,
      });

      if (!rpcResult?.error && rpcResult?.data && Array.isArray(rpcResult.data.customers) && rpcResult.data.meta) {
        return {
          customers: rpcResult.data.customers,
          meta: rpcResult.data.meta,
        };
      }
    } catch {
      // Fall through to database row loader for test mocks
    }

    const { customers, summaries } = await loadData();
    const registeredIdentities = new Set<string>();
    const mapped = customers.map((row) => {
      const key = row.id;
      registeredIdentities.add(key);
      return mapCustomer(row, summaries.get(key) || { count: 0, spend: 0, rows: [] });
    });

    const orderOnly = new Map<string, ReturnType<typeof mapCustomer>>();
    for (const [key, summary] of summaries) {
      if (registeredIdentities.has(key) || summary.rows.length === 0) continue;
      const latest = summary.latestOrder!;
      const fallback = key.startsWith('user:')
        ? { userId: key.slice('user:'.length), email: latest.customer_email, name: latest.customer_name, phone: latest.customer_phone || '' }
        : { email: latest.customer_email, name: latest.customer_name, phone: latest.customer_phone || '' };
      orderOnly.set(key, mapCustomer(undefined, summary, fallback));
    }

    let rows = [...mapped, ...orderOnly.values()].map((entry) => entry.customer);
    const search = query.search?.trim().toLowerCase();
    if (search) rows = rows.filter((customer) => [customer.name, customer.email, customer.phone, customer.city, customer.notes].some((value) => value?.toLowerCase().includes(search)));
    if (query.tier && query.tier !== 'all') rows = rows.filter((customer) => customer.tier === query.tier);
    rows.sort((a, b) => (b.lastOrderAt || b.createdAt || '').localeCompare(a.lastOrderAt || a.createdAt || ''));
    const result = paginate(rows, query);
    return { customers: result.rows, meta: result.meta };
  },

  async getCustomerById(id: string) {
    if (!id || id.length > 128) throw new BadRequestError('Invalid customer ID.', 'INVALID_CUSTOMER_ID');
    const client = getSupabaseServiceClient();

    // Fast path: single indexed SQL RPC resolving both registered & guest_<md5> customers
    try {
      const rpcResult = await (client as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{
          data?: {
            customer?: CustomerRow | null;
            orders?: OrderRow[];
            guest?: { email: string; name: string; phone: string } | null;
          } | null;
          error?: unknown;
        }>;
      }).rpc('admin_get_crm_customer_by_id', { p_id: id });

      if (!rpcResult?.error && rpcResult?.data) {
        const { customer: row, orders = [], guest } = rpcResult.data;
        if (!row && !guest && orders.length === 0) {
          throw new NotFoundError('Customer not found.', 'CUSTOMER_NOT_FOUND');
        }
        const summary: OrderSummary = { count: 0, spend: 0, rows: orders };
        for (const order of orders) {
          const isPaid = order.payment_status === 'PAID';
          const isCancelledOrRefunded =
            order.status === 'CANCELLED' ||
            order.status === 'REFUNDED' ||
            order.payment_status === 'REFUNDED';
          if (order.status !== 'CANCELLED') summary.count += 1;
          if (isPaid && !isCancelledOrRefunded) summary.spend += Number(order.total_amount || 0);
          if (!summary.firstOrderAt || order.created_at < summary.firstOrderAt) summary.firstOrderAt = order.created_at;
          if (!summary.lastOrderAt || order.created_at >= summary.lastOrderAt) {
            summary.lastOrderAt = order.created_at;
            summary.latestOrder = order;
          }
        }
        const customerData = mapCustomer(row || undefined, summary, guest || undefined);
        const orderRows = [...orders]
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
          .map(mapOrder);
        return {
          customer: customerData.customer,
          orders: orderRows,
          sustainabilityImpact: customerData.sustainabilityImpact,
          savedAddresses: customerData.savedAddresses,
          marketingPreferences: customerData.marketingPreferences,
        };
      }
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      // Fall through to direct table queries when RPC is unavailable (or in unit test mocks)
    }

    // Direct indexed lookup for non-guest IDs (avoids full-table scan)
    if (!id.startsWith('guest_')) {
      const userIdLookup = id.startsWith('auth_') ? id.slice('auth_'.length) : id;
      let row: CustomerRow | null = null;
      try {
        if (!id.startsWith('auth_')) {
          const byId = await client
            .from('customers')
            .select('id,user_id,full_name,email,phone,tier,saved_addresses,staff_notes,marketing_opt_in_email,marketing_opt_in_whatsapp,garments_saved,co2_avoided_grams,water_saved_liters,created_at')
            .eq('id', id)
            .maybeSingle() as unknown as { data: CustomerRow | null; error: unknown | null };
          if (byId.error) throw UNAVAILABLE();
          row = byId.data;
        }
        if (!row) {
          const byUserId = await client
            .from('customers')
            .select('id,user_id,full_name,email,phone,tier,saved_addresses,staff_notes,marketing_opt_in_email,marketing_opt_in_whatsapp,garments_saved,co2_avoided_grams,water_saved_liters,created_at')
            .eq('user_id', userIdLookup)
            .maybeSingle() as unknown as { data: CustomerRow | null; error: unknown | null };
          if (byUserId.error) throw UNAVAILABLE();
          row = byUserId.data;
        }
      } catch (err) {
        if (err instanceof ServiceUnavailableError) throw err;
        throw UNAVAILABLE();
      }

      if (row) {
        let fetchedOrders: OrderRow[] = [];
        try {
          const matchCustomerId = row.user_id || row.id;
          const result = await client
            .from('orders')
            .select('id,order_number,customer_id,customer_name,customer_email,customer_phone,total_amount,subtotal,discount_amount,shipping_amount,status,payment_status,payment_method,shipping_address,created_at,updated_at,order_items(serial_number,name,price,quantity,size,image_url)')
            .eq('customer_id', matchCustomerId)
            .order('created_at', { ascending: false }) as unknown as { data: OrderRow[] | null; error: unknown | null };
          if (result.error) throw UNAVAILABLE();
          const normalizedRowEmail = normalizeEmail(row.email);
          fetchedOrders = (result.data || []).filter((order) =>
            order.customer_id === row!.id ||
            (row!.user_id && order.customer_id === row!.user_id) ||
            (!order.customer_id && normalizeEmail(order.customer_email) === normalizedRowEmail)
          );
        } catch (err) {
          if (err instanceof ServiceUnavailableError) throw err;
          throw UNAVAILABLE();
        }

        const summary: OrderSummary = { count: 0, spend: 0, rows: fetchedOrders };
        for (const order of fetchedOrders) {
          const isPaid = order.payment_status === 'PAID';
          const isCancelledOrRefunded =
            order.status === 'CANCELLED' ||
            order.status === 'REFUNDED' ||
            order.payment_status === 'REFUNDED';
          if (order.status !== 'CANCELLED') summary.count += 1;
          if (isPaid && !isCancelledOrRefunded) summary.spend += Number(order.total_amount || 0);
          if (!summary.firstOrderAt || order.created_at < summary.firstOrderAt) summary.firstOrderAt = order.created_at;
          if (!summary.lastOrderAt || order.created_at >= summary.lastOrderAt) {
            summary.lastOrderAt = order.created_at;
            summary.latestOrder = order;
          }
        }
        const customerData = mapCustomer(row, summary);
        const orderRows = [...fetchedOrders]
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
          .map(mapOrder);
        return {
          customer: customerData.customer,
          orders: orderRows,
          sustainabilityImpact: customerData.sustainabilityImpact,
          savedAddresses: customerData.savedAddresses,
          marketingPreferences: customerData.marketingPreferences,
        };
      }
    }

    // Legacy fallback (for guest_<md5> hashes when RPC is not yet deployed or in unit-test mocks)
    const { customers, summaries } = await loadData();
    const normalizedLookup = normalizeEmail(id);
    const row = customers.find((customer) => customer.id === id || customer.user_id === id || normalizeEmail(customer.email) === normalizedLookup);
    let summary: OrderSummary | undefined;
    let customerData: ReturnType<typeof mapCustomer>;
    if (row) {
      const key = row.id;
      summary = summaries.get(key) || { count: 0, spend: 0, rows: [] };
      customerData = mapCustomer(row, summary);
    } else {
      const orderEntry = [...summaries.entries()].find(([key]) =>
        (key.startsWith('user:') && `auth_${key.slice('user:'.length)}` === id) ||
        (key.startsWith('guest:') && (guestId(key.slice('guest:'.length)) === id ||
          legacyGuestId(key.slice('guest:'.length)) === id || key.slice('guest:'.length) === normalizedLookup)),
      );
      if (!orderEntry) throw new NotFoundError('Customer not found.', 'CUSTOMER_NOT_FOUND');
      const [key, foundSummary] = orderEntry;
      summary = foundSummary;
      const latest = summary.latestOrder!;
      const fallback = key.startsWith('user:')
        ? { userId: key.slice('user:'.length), email: latest.customer_email, name: latest.customer_name, phone: latest.customer_phone || '' }
        : { email: latest.customer_email, name: latest.customer_name, phone: latest.customer_phone || '' };
      customerData = mapCustomer(undefined, summary, fallback);
    }

    const rows: OrderRow[] = [];
    try {
      for (let offset = 0; offset < summary.rows.length; offset += 100) {
        const ids = summary.rows.slice(offset, offset + 100).map((order) => order.id);
        const result = await client.from('orders')
          .select('id,order_number,customer_id,customer_name,customer_email,customer_phone,total_amount,subtotal,discount_amount,shipping_amount,status,payment_status,payment_method,shipping_address,created_at,updated_at,order_items(serial_number,name,price,quantity,size,image_url)')
          .in('id', ids).order('created_at', { ascending: false });
        if (result.error) throw UNAVAILABLE();
        rows.push(...(result.data as unknown as OrderRow[]));
      }
    } catch { throw UNAVAILABLE(); }
    const orderRows = rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map(mapOrder);
    return {
      customer: customerData.customer,
      orders: orderRows,
      sustainabilityImpact: customerData.sustainabilityImpact,
      savedAddresses: customerData.savedAddresses,
      marketingPreferences: customerData.marketingPreferences,
    };
  },

  async updateCustomer(id: string, patch: {
    name?: string; phone?: string; notes?: string; tier?: CustomerTier;
    savedAddresses?: Array<Partial<IShippingAddress>>;
    marketingOptInEmail?: boolean; marketingOptInWhatsapp?: boolean;
  }) {
    if (!id || id.length > 128) throw new BadRequestError('Invalid customer ID.', 'INVALID_CUSTOMER_ID');
    const client = getSupabaseServiceClient();
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) values.full_name = patch.name.trim();
    if (patch.phone !== undefined) values.phone = patch.phone.trim();
    if (patch.notes !== undefined) values.staff_notes = patch.notes;
    if (patch.tier !== undefined) values.tier = patch.tier;
    if (patch.savedAddresses !== undefined) values.saved_addresses = patch.savedAddresses;
    if (patch.marketingOptInEmail !== undefined) values.marketing_opt_in_email = patch.marketingOptInEmail;
    if (patch.marketingOptInWhatsapp !== undefined) values.marketing_opt_in_whatsapp = patch.marketingOptInWhatsapp;
    let updated: { data: { id: string } | null; error: unknown | null };
    try { updated = await client.from('customers').update(values).eq('id', id).select('id').maybeSingle() as unknown as typeof updated; }
    catch { throw UNAVAILABLE(); }
    const { data, error } = updated;
    if (error) throw UNAVAILABLE();
    if (!data) throw new NotFoundError('Customer profile not found.', 'CUSTOMER_NOT_FOUND');
    return this.getCustomerById(id);
  },
};
