import request from 'supertest';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { adminAuthService, signSessionToken, verifySessionToken } from '../../src/services/adminAuth.service.js';
import { settingsRepository } from '../../src/repositories/settings.repository.js';
import { SEED_PRODUCTS } from '../../src/data/seedProducts.js';

const settingsState = vi.hoisted(() => ({
  data: {
    announcementText: '', announcementLink: '/new-arrivals', isAnnouncementActive: true,
    marqueePhrases: [], categoryTiles: [], customDrop: { enabled: false, title: '', imageUrl: '', linkUrl: '' },
    storeAddress: '', contactEmail: '', contactPhone: '', whatsappNumber: '+919111222333', isWhatsappVerified: true,
    contentVersion: 1, updatedAt: new Date().toISOString(),
  } as Record<string, any>,
}));
const catalogState = vi.hoisted(() => {
  const rows: Array<Record<string, any>> = [{
    id: 'product-cu-001', serialNumber: 'CU-001', slug: 'top-and-skirt-co-ord-set',
    name: 'Top & Skirt Co-Ord Set', description: 'A skirt and top set', price: 150000,
    stock: 4, images: ['/assets/rtw-1.jpg'], sizes: ['M'], tags: ['skirt'], category: 'womens-one-piece', status: 'PUBLISHED',
  }];
  let serial = 2;
  const find = (id: string) => rows.find((row) => row.serialNumber === id || row.slug === id || row.id === id);
  const create = async (input: Record<string, any>) => {
    const serialNumber = input.serialNumber || `CU-${String(serial++).padStart(3, '0')}`;
    const row = { id: `product-${serialNumber}`, serialNumber, slug: input.slug || `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${serialNumber.toLowerCase()}`, description: '', stock: 1, images: [], sizes: [], status: 'PUBLISHED', ...input };
    rows.push(row);
    return { ...row };
  };
  return {
    rows,
    listProducts: async (query: Record<string, any>) => {
      const matching = rows.filter((row) => !query.search || `${row.name} ${row.description} ${(row.tags || []).join(' ')}`.toLowerCase().includes(query.search.toLowerCase()));
      return { products: matching, total: matching.length, page: Number(query.page || 1), limit: Number(query.limit || 20), meta: { total: matching.length, page: Number(query.page || 1), limit: Number(query.limit || 20), totalPages: 1, hasNext: false, hasPrev: false } };
    },
    getProduct: async (id: string) => { const row = find(id); if (!row) throw new Error('Product not found'); return { ...row }; },
    related: async () => [],
    create,
    update: async (id: string, input: Record<string, any>) => { const row = find(id); if (!row) throw new Error('Product not found'); Object.assign(row, input); return { ...row }; },
    remove: async (id: string) => { const row = find(id); if (!row) throw new Error('Product not found'); row.status = 'ARCHIVED'; return { message: 'Product archived.' }; },
    seed: async (products: Array<Record<string, any>>) => products.length,
    adminList: async () => ({ products: rows, total: rows.length, page: 1, limit: 20 }),
    duplicate: async (id: string) => create({ ...find(id), name: `${find(id)?.name} (Copy)`, status: 'DRAFT' }),
    bulk: async (_action: string, ids: string[]) => ({ modifiedCount: ids.length }),
    restore: async (id: string) => { const row = find(id); if (!row) throw new Error('Product not found'); row.status = 'PUBLISHED'; return { message: 'Product restored.' }; },
    permanent: async (id: string) => { const index = rows.findIndex((row) => row.serialNumber === id || row.id === id); if (index >= 0) rows.splice(index, 1); return { message: 'Product permanently deleted.' }; },
  };
});
const checkoutState = vi.hoisted(() => {
  const products = new Map<string, Record<string, any>>();
  const orders = new Map<string, Record<string, any>>();
  const idempotency = new Map<string, { fingerprint: string; response: Record<string, any>; expiresAt: number }>();
  const adminAuditRecords: Array<Record<string, unknown>> = [];
  let enabled = true;
  let injectedFailure: Error | null = null;
  let adminAuditFailure = false;
  let filters: Array<[string, unknown]> = [];
  let updateValues: Record<string, unknown> | null = null;
  const builder: Record<string, (...args: any[]) => any> = {};
  const matching = () => [...orders.values()].filter((row) => filters.every(([key, value]) => row[key] === value));
  const chain = () => builder;
  const result = () => {
    if (!enabled) return { data: null, count: null, error: { message: 'Supabase is unavailable' } };
    const rows = matching();
    if (updateValues) rows.forEach((row) => Object.assign(row, updateValues));
    return { data: updateValues ? rows.map((row) => ({ id: row.id })) : rows, count: rows.length, error: null };
  };
  Object.assign(builder, {
    select: chain,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    order: chain, range: chain, or: chain,
    update: (values: Record<string, unknown>) => { updateValues = values; return builder; },
    maybeSingle: async () => { const response = result(); return { ...response, data: Array.isArray(response.data) ? response.data[0] || null : response.data }; },
    then: (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  });
  const client = {
    from: (_table: string) => { filters = []; updateValues = null; return builder; },
    rpc: async (name: string, params: Record<string, any>) => {
      if (!enabled) return { data: null, error: { message: 'Supabase is unavailable' } };
      const order = [...orders.values()].find((row) => row.order_number === params.p_order_ref || row.id === params.p_order_ref);
      const failure = (code: string, message: string) => ({ data: null, error: { message: JSON.stringify({ code, message }) } });
      if (!order) return failure('ORDER_NOT_FOUND', 'Order was not found.');
      if (adminAuditFailure) return { data: null, error: { message: 'injected audit insert failure' } };
      if (name === 'admin_update_order_status') {
        const transitions: Record<string, string[]> = { PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPED', 'CANCELLED'], SHIPPED: ['DELIVERED', 'CANCELLED'], DELIVERED: [], CANCELLED: [] };
        if (!transitions[String(order.status)]?.includes(String(params.p_new_status))) return failure('INVALID_STATUS_TRANSITION', 'This order status transition is not allowed.');
        if (params.p_new_status === 'CANCELLED') {
          const totals = new Map<string, number>();
          for (const item of order.order_items || []) totals.set(item.serial_number, (totals.get(item.serial_number) || 0) + item.quantity);
          for (const serial of totals.keys()) if (!products.has(serial)) return failure('ORDER_INVENTORY_UNAVAILABLE', 'A product required for inventory restoration no longer exists.');
          for (const [serial, quantity] of totals) {
            const product = products.get(serial)!;
            product.stock += quantity;
            if (product.status === 'SOLD_OUT') product.status = 'ACTIVE';
          }
        }
        order.status = params.p_new_status;
        order.updated_at = new Date().toISOString();
        adminAuditRecords.push({ action: 'ORDER_STATUS_UPDATE', orderNumber: order.order_number, actor: params.p_actor_id });
      } else if (name === 'admin_mark_order_payment_received') {
        if (order.payment_method === 'ONLINE_UPI') return failure('PAYMENT_PROVIDER_UNAVAILABLE', 'Online payment cannot be manually marked received; provider verification is unavailable.');
        if (!['CASH_ON_DELIVERY', 'WHATSAPP_UPI'].includes(order.payment_method)) return failure('INVALID_MANUAL_PAYMENT_METHOD', 'This payment method cannot be manually verified.');
        if (!['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status)) return failure('INVALID_PAYMENT_ORDER_STATE', 'Payment cannot be recorded for an order in its current state.');
        if (order.payment_status !== 'PENDING') return failure('PAYMENT_ALREADY_RECORDED', 'Payment has already been recorded for this order.');
        order.payment_status = 'PAID';
        order.updated_at = new Date().toISOString();
        adminAuditRecords.push({ action: 'ORDER_PAYMENT_VERIFIED', orderNumber: order.order_number, actor: params.p_actor_id });
      } else return failure('DATABASE_UNAVAILABLE', 'Unknown admin order RPC.');
      return { data: { order, order_items: order.order_items || [] }, error: null };
    },
  };
  return {
    products, orders, idempotency, client,
    setEnabled: (value: boolean) => { enabled = value; },
    setFailure: (error: Error | null) => { injectedFailure = error; },
    adminAuditRecords,
    setAdminAuditFailure: (value: boolean) => { adminAuditFailure = value; },
    reset: () => { products.clear(); orders.clear(); idempotency.clear(); adminAuditRecords.length = 0; injectedFailure = null; adminAuditFailure = false; enabled = true; },
    execute: async (params: Record<string, any>) => {
      if (!enabled) {
        const { ServiceUnavailableError } = await import('../../src/errors/AppError.js');
        throw new ServiceUnavailableError('Supabase checkout unavailable.', 'DATABASE_UNAVAILABLE');
      }
      if (injectedFailure) throw injectedFailure;
      const now = Date.now();
      const cached = idempotency.get(params.p_key_hash);
      if (cached && cached.expiresAt > now) {
        if (cached.fingerprint !== params.p_fingerprint) {
          const { ConflictError } = await import('../../src/errors/AppError.js');
          throw new ConflictError('This idempotency key was already used for a different checkout.', 'IDEMPOTENCY_KEY_REUSED');
        }
        return cached.response;
      }
      if (cached) idempotency.delete(params.p_key_hash);
      const { BadRequestError, NotFoundError, UnprocessableEntityError } = await import('../../src/errors/AppError.js');
      if (!['CASH_ON_DELIVERY', 'WHATSAPP_UPI'].includes(params.p_payment_method)) throw new BadRequestError('Unsupported payment method.', 'VALIDATION_ERROR');
      const quantities = new Map<string, number>();
      for (const item of params.p_items) quantities.set(item.serialNumber, (quantities.get(item.serialNumber) || 0) + item.quantity);
      for (const [serial, quantity] of quantities) {
        if (quantity > 10) throw new BadRequestError('Maximum quantity per product is 10.', 'INVALID_QUANTITY');
        const product = products.get(serial);
        if (!product) throw new NotFoundError(`Product "${serial}" is not available to order.`, 'PRODUCT_NOT_ORDERABLE');
        if (!['AVAILABLE', 'ACTIVE', 'PUBLISHED'].includes(String(product.status))) throw new NotFoundError(`Product "${serial}" is not available to order.`, 'PRODUCT_NOT_ORDERABLE');
        if (!Number.isSafeInteger(product.price) || product.price < 0) throw new UnprocessableEntityError('Invalid stored price.', 'INVALID_PRODUCT_PRICE');
        if (!Number.isSafeInteger(product.stock) || product.stock < quantity) throw new BadRequestError(`Insufficient stock for "${serial}".`, 'OUT_OF_STOCK');
      }
      if (params.p_promo_code) throw new BadRequestError('Invalid or expired promotional code.', 'COUPON_REQUIRED');
      const items = params.p_items.map((item: Record<string, any>) => {
        const product = products.get(item.serialNumber)!;
        const size = item.size || product.sizes?.[0] || 'One Size';
        if (product.sizes?.length && !product.sizes.includes(size)) throw new BadRequestError('Requested size is not available.', 'INVALID_VARIANT');
        return { productId: product._id?.toString() || `product-${item.serialNumber}`, serialNumber: item.serialNumber, name: product.name, price: product.price, quantity: item.quantity, size, image: product.images?.[0] || '', slug: product.slug };
      });
      const subtotal = items.reduce((sum: number, item: Record<string, any>) => sum + item.price * item.quantity, 0);
      const deliveryFee = subtotal >= 150000 ? 0 : 9000;
      const orderNumber = params.p_order_number;
      const createdAt = new Date().toISOString();
      const response = {
        id: `order-${orderNumber}`, orderNumber, customerId: params.p_customer_id,
        customer: params.p_customer, shippingAddress: params.p_shipping_address, items,
        subtotal, discount: 0, deliveryFee, totalAmount: subtotal + deliveryFee,
        status: 'CONFIRMED', paymentMethod: params.p_payment_method, paymentStatus: 'PENDING',
        promoCode: null, notes: params.p_notes, guestAccessToken: null, createdAt,
      };
      for (const [serial, quantity] of quantities) {
        const product = products.get(serial)!;
        product.stock -= quantity;
        if (product.stock === 0) product.status = 'SOLD_OUT';
      }
      const dbOrder = {
        id: response.id, order_number: orderNumber, customer_id: response.customerId,
        customer_name: params.p_customer.name, customer_email: params.p_customer.email, customer_phone: params.p_customer.phone,
        total_amount: response.totalAmount, subtotal: response.subtotal, discount_amount: response.discount, shipping_amount: response.deliveryFee,
        status: response.status, payment_method: response.paymentMethod, payment_status: response.paymentStatus,
        shipping_address: params.p_shipping_address, promo_code: null, notes: params.p_notes,
        guest_access_token_hash: params.p_guest_access_token_hash, guest_access_expires_at: params.p_guest_access_expires_at,
        created_at: createdAt, updated_at: createdAt, order_items: items.map((item: Record<string, any>) => ({ ...item, product_id: item.productId, serial_number: item.serialNumber, image_url: item.image })),
      };
      orders.set(orderNumber, dbOrder);
      idempotency.set(params.p_key_hash, { fingerprint: params.p_fingerprint, response, expiresAt: now + 24 * 60 * 60 * 1000 });
      return response;
    },
  };
});
vi.mock('../../src/services/supabase.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabase.service.js')>();
  return { ...actual, getSupabaseAdminClient: () => checkoutState.client, isSupabaseConfigured: () => true, isSupabaseCheckoutConfigured: () => true, executeStorefrontCheckoutRpc: checkoutState.execute };
});
vi.mock('../../src/services/supabaseCatalog.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabaseCatalog.service.js')>();
  return { ...actual, supabaseCatalogService: {
    ...actual.supabaseCatalogService,
    listProducts: catalogState.listProducts,
    getProductByIdentifier: catalogState.getProduct,
    getRelatedProducts: catalogState.related,
    createProduct: catalogState.create,
    updateProduct: catalogState.update,
    softDeleteProduct: catalogState.remove,
    seedProducts: catalogState.seed,
    listAdminProducts: catalogState.adminList,
    duplicateProduct: catalogState.duplicate,
    bulkAction: catalogState.bulk,
    restoreProduct: catalogState.restore,
    permanentDeleteProduct: catalogState.permanent,
  } };
});
vi.mock('../../src/repositories/settings.repository.js', () => ({
  getConfiguredWhatsappNumber: (value?: string) => {
    const digits = value?.replace(/\D/g, '') ?? '';
    return digits.length >= 10 ? value : '';
  },
  settingsRepository: {
    getSettings: async () => ({ ...settingsState.data }),
    updateSettings: async (patch: Record<string, unknown>) => (settingsState.data = { ...settingsState.data, ...patch, contentVersion: settingsState.data.contentVersion + 1 }),
    bumpVersion: async () => ++settingsState.data.contentVersion,
  },
}));

const app = createApp();
let checkoutIp = 10;
const checkoutRequest = () => request(app).post('/api/v1/orders').set('X-Forwarded-For', `192.0.2.${checkoutIp++}`);
const checkoutPayload = (items: Array<{ serialNumber: string; quantity: number }>, promoCode?: string, paymentMethod = 'WHATSAPP_UPI') => ({
  customer: { name: 'Regression Buyer', email: 'regression@example.com', phone: '+919876543210' },
  shippingAddress: { addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050' },
  items,
  paymentMethod,
  ...(promoCode ? { promoCode } : {}),
});
const ownerSession = signSessionToken({
  userId: 'phase1-owner',
  email: 'owner@circleuponline.com',
  name: 'Test Owner',
  role: 'owner',
  csrfToken: 'phase1-owner-csrf',
  expiresAt: Date.now() + 60_000,
  sessionId: 'fixture-owner-session',
});
const staffSession = signSessionToken({
  userId: 'phase1-staff',
  email: 'staff@circleuponline.com',
  name: 'Test Staff',
  role: 'staff',
  csrfToken: 'phase1-staff-csrf',
  expiresAt: Date.now() + 60_000,
  sessionId: 'fixture-staff-session',
});

beforeEach(() => {
  vi.spyOn(adminAuthService, 'validateSession').mockImplementation(async (token) => verifySessionToken(token));
  checkoutState.reset();
  for (const product of SEED_PRODUCTS) checkoutState.products.set(product.serialNumber, { ...product, stock: 100, status: 'PUBLISHED' });
});

describe('Products & Orders API', () => {
  it('protects legacy product mutations with admin auth and CSRF checks', async () => {
    const create = await request(app).post('/api/v1/products').send({ name: 'Unauthorized item' });
    const update = await request(app).put('/api/products/CU-001').send({ price: 1 });
    const remove = await request(app).delete('/api/v1/products/CU-001');
    const seedAsStaff = await request(app)
      .post('/api/products/seed')
      .set('Authorization', `Bearer ${staffSession}`)
      .set('X-CSRF-Token', 'phase1-staff-csrf');
    const createWithoutCsrf = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerSession}`)
      .send({ name: 'Missing CSRF', price: 100, stock: 1 });
    const createAsStaff = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${staffSession}`)
      .set('X-CSRF-Token', 'phase1-staff-csrf')
      .send({ serialNumber: 'AUTH-001', name: 'Authorized test item', description: 'Test fixture', price: 150000, stock: 2 });
    const updateAsOwner = await request(app)
      .put('/api/products/AUTH-001')
      .set('Authorization', `Bearer ${ownerSession}`)
      .set('X-CSRF-Token', 'phase1-owner-csrf')
      .send({ price: 175000 });
    const removeAsOwner = await request(app)
      .delete('/api/v1/products/AUTH-001')
      .set('Authorization', `Bearer ${ownerSession}`)
      .set('X-CSRF-Token', 'phase1-owner-csrf');

    expect([create.status, update.status, remove.status]).toEqual([401, 401, 401]);
    expect(createWithoutCsrf.status).toBe(403);
    expect(createWithoutCsrf.body.error.code).toBe('INVALID_CSRF_TOKEN');
    expect(seedAsStaff.status).toBe(403);
    expect(seedAsStaff.body.error.code).toBe('FORBIDDEN_ROLE');
    expect(createAsStaff.status, JSON.stringify(createAsStaff.body)).toBe(201);
    expect(updateAsOwner.status).toBe(200);
    expect(removeAsOwner.status).toBe(200);
  });

  it('GET /api/v1/products returns list of products with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/products');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page', 1);

    const first = res.body.data[0];
    expect(first).toHaveProperty('serialNumber');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('price');
    expect(first).toHaveProperty('stock');
    expect(first).toHaveProperty('images');
    expect(first).toHaveProperty('sizes');
  });

  it('GET /api/v1/products with category and search filter', async () => {
    const res = await request(app).get('/api/v1/products?search=skirt&sort=price-asc');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const item of res.body.data) {
      expect(
        item.name.toLowerCase().includes('skirt') ||
          item.description?.toLowerCase().includes('skirt') ||
          item.tags?.some((t: string) => t.includes('skirt')),
      ).toBe(true);
    }
  });

  it('GET /api/v1/products/:identifier resolves by serialNumber or slug', async () => {
    const bySerial = await request(app).get('/api/v1/products/CU-001');
    expect(bySerial.status).toBe(200);
    expect(bySerial.body.success).toBe(true);
    expect(bySerial.body.data.serialNumber).toBe('CU-001');
    expect(bySerial.body.data.name).toBe('Top & Skirt Co-Ord Set');

    const bySlug = await request(app).get('/api/v1/products/top-and-skirt-co-ord-set');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.success).toBe(true);
    expect(bySlug.body.data.serialNumber).toBe('CU-001');
  });

  it('POST /api/v1/orders places an order and returns confirmation with orderNumber', async () => {
    const orderPayload = {
      customer: {
        name: 'Tara Mehta',
        email: 'tara.mehta@example.com',
        phone: '+919876543210',
      },
      shippingAddress: {
        addressLine: '42 Vintage Lane, Bandra West',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
      },
      items: [
        {
          serialNumber: 'CU-001',
          quantity: 1,
          size: 'M',
        },
      ],
      paymentMethod: 'WHATSAPP_UPI',
      notes: 'Please ring bell upon delivery',
    };

    const res = await checkoutRequest().set('Idempotency-Key', 'product-order-key-0001').send(orderPayload);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('orderNumber');
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    expect(res.body.data.customer.name).toBe('Tara Mehta');
    expect(res.body.data.paymentMethod).toBe('WHATSAPP_UPI');
    expect(res.body.data.paymentStatus).toBe('PENDING');
  });

  it('creates COD orders with pending payment status', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'cod-pending-confirmation-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }], undefined, 'CASH_ON_DELIVERY'));
    expect(res.status).toBe(201);
    expect(res.body.data.paymentMethod).toBe('CASH_ON_DELIVERY');
    expect(res.body.data.paymentStatus).toBe('PENDING');
  });

  it('lists admin orders from Supabase and returns unavailable errors without fallback', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-list-order-key-0001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const listed = await request(app).get('/api/admin/orders?page=1&limit=10&status=CONFIRMED')
      .set('Authorization', `Bearer ${staffSession}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data[0].orderNumber).toBe(created.body.data.orderNumber);
    expect(listed.body.data[0]).toMatchObject({ discount: 0, deliveryFee: 9000, status: 'CONFIRMED' });
    expect(listed.body.data[0].items[0]).toHaveProperty('image', '/assets/rtw-1.jpg');
    expect(listed.body.data[0]).not.toHaveProperty('discountAmount');
    expect(listed.body.data[0]).not.toHaveProperty('shippingAmount');
    expect(listed.body.meta.total).toBe(1);

    checkoutState.setEnabled(false);
    try {
      const unavailable = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${staffSession}`);
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.error.code).toBe('DATABASE_UNAVAILABLE');
    } finally {
      checkoutState.setEnabled(true);
    }
  });

  it('serves admin order details and item data from Supabase', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-detail-order-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const detail = await request(app).get(`/api/v1/orders/${created.body.data.orderNumber}`)
      .set('Authorization', `Bearer ${staffSession}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.orderNumber).toBe(created.body.data.orderNumber);
    expect(detail.body.data.items).toHaveLength(1);
    expect(detail.body.data).not.toHaveProperty('guestAccessTokenHash');
  });

  it('updates status in Supabase and rejects unauthenticated status changes', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-status-order-key-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const unauthorized = await request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/status`).send({ status: 'SHIPPED' });
    expect(unauthorized.status).toBe(401);

    const updated = await request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ status: 'SHIPPED' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('SHIPPED');
    expect(updated.body.data.customer.email).toBe('regression@example.com');
    expect(updated.body.data.items).toHaveLength(1);
    expect(updated.body.data).toHaveProperty('discount');
    expect(updated.body.data).toHaveProperty('deliveryFee');
    expect(updated.body.data.items[0]).toHaveProperty('image', '/assets/rtw-1.jpg');
    expect(checkoutState.adminAuditRecords.at(-1)?.action).toBe('ORDER_STATUS_UPDATE');

    checkoutState.setEnabled(false);
    const unavailable = await request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ status: 'DELIVERED' });
    expect(unavailable.status).toBe(503);
    expect(checkoutState.orders.get(created.body.data.orderNumber)?.status).toBe('SHIPPED');
    checkoutState.setEnabled(true);
  });

  it('cancels once, restores inventory atomically and rejects duplicate cancellation', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-cancel-order-key-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 2 }]));
    const beforeCancel = checkoutState.products.get('CU-001')!.stock;
    const cancel = () => request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ status: 'CANCELLED' });
    checkoutState.setAdminAuditFailure(true);
    const auditFailure = await cancel();
    expect(auditFailure.status).toBe(503);
    expect(checkoutState.orders.get(created.body.data.orderNumber)?.status).toBe('CONFIRMED');
    expect(checkoutState.products.get('CU-001')?.stock).toBe(beforeCancel);
    checkoutState.setAdminAuditFailure(false);
    const first = await cancel();
    expect(first.status).toBe(200);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(beforeCancel + 2);
    const duplicate = await cancel();
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(checkoutState.products.get('CU-001')?.stock).toBe(beforeCancel + 2);
  });

  it('restores inventory without republishing an item archived after checkout', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-cancel-archived-product-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const product = checkoutState.products.get('CU-001')!;
    const beforeCancel = product.stock;
    product.status = 'ARCHIVED';

    const cancelled = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ status: 'CANCELLED' });

    expect(cancelled.status).toBe(200);
    expect(product.stock).toBe(beforeCancel + 1);
    expect(product.status).toBe('ARCHIVED');
  });

  it('serializes concurrent cancellations so inventory is restored exactly once', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-cancel-race-order-01')
      .send(checkoutPayload([{ serialNumber: 'CU-002', quantity: 3 }]));
    const beforeCancel = checkoutState.products.get('CU-002')!.stock;
    const cancel = () => request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ status: 'CANCELLED' });
    const results = await Promise.all([cancel(), cancel()]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 400)).toHaveLength(1);
    expect(checkoutState.products.get('CU-002')?.stock).toBe(beforeCancel + 3);
  });

  it('does not cancel or partially restore inventory when restoration fails', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-cancel-rollback-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const beforeStock = checkoutState.products.get('CU-001')!.stock;
    checkoutState.products.delete('CU-001');
    const failed = await request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ status: 'CANCELLED' });
    expect(failed.status).toBe(503);
    expect(checkoutState.orders.get(created.body.data.orderNumber)?.status).toBe('CONFIRMED');
    expect(checkoutState.adminAuditRecords).toHaveLength(0);
    expect(beforeStock).toBe(99);
  });

  it('does not mark payment or claim success when the required audit insert fails', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-payment-audit-fail-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    checkoutState.setAdminAuditFailure(true);
    const failed = await request(app).put(`/api/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(failed.status).toBe(503);
    expect(checkoutState.orders.get(created.body.data.orderNumber)?.payment_status).toBe('PENDING');
  });

  it('rejects WhatsApp / UPI checkout when no store contact is configured without reserving stock', async () => {
    await settingsRepository.updateSettings({ whatsappNumber: '', isWhatsappVerified: false });
    const beforeStock = checkoutState.products.get('CU-001')!.stock;
    const beforeOrders = checkoutState.orders.size;
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'whatsapp-unconfigured-key-001')
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
      const afterStock = checkoutState.products.get('CU-001')!.stock;
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      expect(afterStock).toBe(beforeStock);
      expect(checkoutState.orders.size).toBe(beforeOrders);
    } finally {
      await settingsRepository.updateSettings({ whatsappNumber: '+919111222333', isWhatsappVerified: true });
    }
  });

  it('rejects unsupported payment methods at the shared checkout schema', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'unsupported-payment-method-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }], undefined, 'WHATSAPP_BANK_TRANSFER'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/orders rejects unknown products instead of assigning a fallback price', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'unknown-product-key-0002').send({
      customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+919876543210' },
      shippingAddress: {
        addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
      },
      items: [{ serialNumber: 'UNKNOWN-ITEM', quantity: 1 }],
      paymentMethod: 'WHATSAPP_UPI',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_ORDERABLE');
  });

  it('rejects online payment without a verified payment flow and does not persist an order', async () => {
    const before = checkoutState.orders.size;
    const res = await checkoutRequest().set('Idempotency-Key', 'online-payment-key-0003').send({
      customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+919876543210' },
      shippingAddress: {
        addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
      },
      items: [{ serialNumber: 'CU-001', quantity: 1 }],
      paymentMethod: 'ONLINE_UPI',
    });
    const after = checkoutState.orders.size;

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
    expect(after).toBe(before);
  });

  it('records WhatsApp payment as paid only through owner-authenticated, CSRF-protected verification', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-verified-payment-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    expect(created.status).toBe(201);
    expect(created.body.data.paymentStatus).toBe('PENDING');

    const forbidden = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ paymentStatus: 'PAID' });
    expect(forbidden.status).toBe(403);

    const missingCsrf = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).send({ paymentStatus: 'PAID' });
    expect(missingCsrf.status).toBe(403);

    const verified = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.paymentStatus).toBe('PAID');
    expect(verified.body.data.items).toHaveLength(1);
    expect(verified.body.data).toHaveProperty('deliveryFee');
    expect(checkoutState.adminAuditRecords.filter((record) => record.action === 'ORDER_PAYMENT_VERIFIED')).toHaveLength(1);

    const duplicateVerification = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(duplicateVerification.status).toBe(400);
    expect(duplicateVerification.body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(checkoutState.adminAuditRecords.filter((record) => record.action === 'ORDER_PAYMENT_VERIFIED')).toHaveLength(1);
  });

  it('rejects manual payment for cancelled orders and unsupported methods', async () => {
    const cancelled = await checkoutRequest().set('Idempotency-Key', 'cancelled-payment-key-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    for (const status of ['CANCELLED', 'REFUNDED', 'FAILED', 'PENDING']) {
      const row = checkoutState.orders.get(cancelled.body.data.orderNumber)!;
      row.status = status;
      row.payment_status = 'PENDING';
      const invalidStateAttempt = await request(app).put(`/api/v1/admin/orders/${cancelled.body.data.orderNumber}/payment-status`)
        .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
      expect(invalidStateAttempt.status).toBe(400);
      expect(invalidStateAttempt.body.error.code).toBe('INVALID_PAYMENT_ORDER_STATE');
    }

    const unsupported = await checkoutRequest().set('Idempotency-Key', 'unsupported-payment-key-001')
      .send(checkoutPayload([{ serialNumber: 'CU-002', quantity: 1 }]));
    checkoutState.orders.get(unsupported.body.data.orderNumber)!.payment_method = 'ONLINE_UPI';
    const unsupportedAttempt = await request(app).put(`/api/v1/admin/orders/${unsupported.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(unsupportedAttempt.status).toBe(400);
    expect(unsupportedAttempt.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    const invalidMethod = await checkoutRequest().set('Idempotency-Key', 'invalid-method-payment-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-003', quantity: 1 }]));
    checkoutState.orders.get(invalidMethod.body.data.orderNumber)!.payment_method = 'UNKNOWN_METHOD';
    const invalidMethodAttempt = await request(app).put(`/api/v1/admin/orders/${invalidMethod.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(invalidMethodAttempt.status).toBe(400);
    expect(invalidMethodAttempt.body.error.code).toBe('INVALID_MANUAL_PAYMENT_METHOD');
  });

  it('allows an owner to record a COD payment after collection', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'cod-payment-verified-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-002', quantity: 1 }], undefined, 'CASH_ON_DELIVERY'));
    expect(created.status).toBe(201);
    const verified = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.paymentMethod).toBe('CASH_ON_DELIVERY');
    expect(verified.body.data.paymentStatus).toBe('PAID');
    expect(checkoutState.adminAuditRecords.filter((record) => record.action === 'ORDER_PAYMENT_VERIFIED')).toHaveLength(1);
  });

  it('rolls back payment status when its required audit event cannot be written', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'audit-failure-payment-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    checkoutState.setAdminAuditFailure(true);
    try {
      const res = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
        .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(res.status).toBe(503);
      expect(checkoutState.orders.get(created.body.data.orderNumber)?.payment_status).toBe('PENDING');
    } finally {
      checkoutState.setAdminAuditFailure(false);
    }
  });

  it.each(['DRAFT', 'ARCHIVED', 'MISSING', 'NEED_ATTENTION', 'SOLD_OUT'])(
    'rejects product status %s during checkout', async (status) => {
      checkoutState.products.get('CU-001')!.status = status;
      const res = await checkoutRequest().set('Idempotency-Key', `status-test-${status.toLowerCase()}-0001`)
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_ORDERABLE');
    },
  );

  it('rejects deleted products during checkout', async () => {
    checkoutState.products.get('CU-001')!.status = 'ARCHIVED';
    const res = await checkoutRequest().set('Idempotency-Key', 'deleted-product-key-0001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_ORDERABLE');
  });

  it.each([0, -1, 1.5])('rejects invalid checkout quantity %s', async (quantity) => {
    const res = await checkoutRequest().set('Idempotency-Key', `invalid-quantity-${String(quantity).replace('.', '-')}-0001`)
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity }]));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unexpected client price and payment fields', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'unexpected-fields-key-001')
      .send({ ...checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]), paymentStatus: 'PAID', totalAmount: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid stored prices before reserving stock', async () => {
    Object.assign(checkoutState.products.get('CU-001')!, { price: 1.5, stock: 8 });
    const res = await checkoutRequest().set('Idempotency-Key', 'invalid-price-key-0001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_PRODUCT_PRICE');
    expect(checkoutState.products.get('CU-001')?.stock).toBe(8);
  });

  it('rolls back all inventory when order persistence fails after reservation', async () => {
    checkoutState.products.get('CU-001')!.stock = 7;
    checkoutState.products.get('CU-002')!.stock = 9;
    checkoutState.setFailure(new Error('injected Supabase transaction failure'));
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'rollback-order-key-0001')
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 2 }, { serialNumber: 'CU-002', quantity: 3 }]));
      expect(res.status).toBe(500);
      expect(checkoutState.products.get('CU-001')?.stock).toBe(7);
      expect(checkoutState.products.get('CU-002')?.stock).toBe(9);
      const idemHash = createHash('sha256').update('rollback-order-key-0001').digest('hex');
      expect(checkoutState.idempotency.has(idemHash)).toBe(false);
    } finally {
      checkoutState.setFailure(null);
    }
  });

  it('refuses coupons whose atomic checkout rules are not satisfied without persisting an order', async () => {
    const ordersBefore = checkoutState.orders.size;
    const stockBefore = checkoutState.products.get('CU-001')?.stock;
    const res = await checkoutRequest().set('Idempotency-Key', 'rollback-coupon-key-0001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }], 'ROLLBACK10'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COUPON_REQUIRED');
    expect(checkoutState.orders.size).toBe(ordersBefore);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(stockBefore);
  });

  it('does not oversell the last item when two different checkouts race', async () => {
    checkoutState.products.get('CU-001')!.stock = 1;
    const before = checkoutState.orders.size;
    const submit = (key: string) => checkoutRequest().set('Idempotency-Key', key)
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const results = await Promise.all([submit('concurrent-checkout-key-001'), submit('concurrent-checkout-key-002')]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(0);
    expect(checkoutState.orders.size).toBe(before + 1);
  });

  it('replays duplicate checkout keys without creating a second order or deducting stock twice', async () => {
    checkoutState.products.get('CU-001')!.stock = 5;
    const before = checkoutState.orders.size;
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const first = await checkoutRequest().set('Idempotency-Key', 'duplicate-checkout-key-01').send(payload);
    const second = await checkoutRequest().set('Idempotency-Key', 'duplicate-checkout-key-01').send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);
    expect(second.body.data.guestAccessToken).toBe(first.body.data.guestAccessToken);
    expect(checkoutState.orders.size).toBe(before + 1);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(4);
  });

  it('rejects reusing an idempotency key with a different request fingerprint', async () => {
    const key = 'fingerprint-mismatch-key-001';
    const original = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const first = await checkoutRequest().set('Idempotency-Key', key).send(original);
    const changed = { ...original, notes: 'Different customer instruction' };
    const second = await checkoutRequest().set('Idempotency-Key', key).send(changed);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('allows the same key to retry successfully after a rolled back checkout', async () => {
    checkoutState.products.get('CU-001')!.stock = 6;
    const key = 'retry-after-abort-key-01';
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 2 }]);
    checkoutState.setFailure(new Error('injected transient persistence failure'));
    const failed = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    checkoutState.setFailure(null);
    expect(failed.status).toBe(500);
    const retry = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    expect(retry.status).toBe(201);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(4);
    expect(checkoutState.orders.has(retry.body.data.orderNumber)).toBe(true);
  });

  it('does not replay an expired idempotency record and creates a fresh order', async () => {
    checkoutState.products.get('CU-001')!.stock = 5;
    const key = 'expired-idempotency-key-001';
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const first = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    expect(first.status).toBe(201);
    const keyHash = createHash('sha256').update(key).digest('hex');
    checkoutState.idempotency.get(keyHash)!.expiresAt = Date.now() - 1000;
    const second = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    expect(second.status).toBe(201);
    expect(second.body.data.orderNumber).not.toBe(first.body.data.orderNumber);
    expect(checkoutState.orders.has(first.body.data.orderNumber)).toBe(true);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(3);
    expect(checkoutState.idempotency.has(keyHash)).toBe(true);
    expect(checkoutState.idempotency.get(keyHash)?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('replays concurrent submissions sharing one idempotency key without duplicate reservation', async () => {
    checkoutState.products.get('CU-001')!.stock = 5;
    const before = checkoutState.orders.size;
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const submit = () => checkoutRequest().set('Idempotency-Key', 'concurrent-same-key-001').send(payload);
    const [first, second] = await Promise.all([submit(), submit()]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.orderNumber).toBe(second.body.data.orderNumber);
    expect(checkoutState.orders.size).toBe(before + 1);
    expect(checkoutState.products.get('CU-001')?.stock).toBe(4);
    const retry = await submit();
    expect(retry.status).toBe(201);
    expect(checkoutState.orders.size).toBe(before + 1);
  });

  it('fails checkout when Supabase is unavailable without falling back to MongoDB', async () => {
    checkoutState.setEnabled(false);
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'offline-checkout-key-0004').send({
        customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+919876543210' },
        shippingAddress: {
          addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
        },
        items: [{ serialNumber: 'CU-001', quantity: 1 }],
        paymentMethod: 'WHATSAPP_UPI',
      });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
      expect(res.body.data).toBeUndefined();
    } finally { checkoutState.setEnabled(true); }
  });

});

