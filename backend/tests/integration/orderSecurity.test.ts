import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({
  data: {
    announcementText: '', announcementLink: '/new-arrivals', isAnnouncementActive: true,
    marqueePhrases: [], categoryTiles: [], customDrop: { enabled: false, title: '', imageUrl: '', linkUrl: '' },
    storeAddress: '', contactEmail: '', contactPhone: '', whatsappNumber: '+919111222333', isWhatsappVerified: true,
    contentVersion: 1, updatedAt: new Date().toISOString(),
  } as Record<string, any>,
}));
const checkoutState = vi.hoisted(() => {
  const rows = new Map<string, Record<string, any>>();
  const idempotency = new Map<string, { fingerprint: string; response: Record<string, any> }>();
  let filters: Array<[string, unknown]> = [];
  let updateValues: Record<string, unknown> | null = null;
  const builder: Record<string, (...args: any[]) => any> = {};
  const matches = (row: Record<string, any>) => filters.every(([key, value]) => row[key] === value);
  const result = () => {
    const found = [...rows.values()].filter(matches);
    if (updateValues) for (const row of found) Object.assign(row, updateValues);
    return { data: updateValues ? found.map((row) => ({ id: row.id })) : found, count: found.length, error: null };
  };
  const chain = () => builder;
  Object.assign(builder, {
    select: chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    order: chain, range: chain, update: (values: Record<string, unknown>) => { updateValues = values; return builder; },
    maybeSingle: async () => { const response = result(); return { ...response, data: Array.isArray(response.data) ? response.data[0] || null : response.data }; },
    then: (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  });
  const client = { from: (_name: string) => { filters = []; updateValues = null; return builder; } };
  return {
    rows, idempotency, client,
    reset: () => { rows.clear(); idempotency.clear(); },
    checkout: async (params: Record<string, any>) => {
      const cached = idempotency.get(params.p_key_hash);
      if (cached) {
        if (cached.fingerprint !== params.p_fingerprint) {
          const { ConflictError } = await import('../../src/errors/AppError.js');
          throw new ConflictError('This idempotency key was already used for a different checkout.', 'IDEMPOTENCY_KEY_REUSED');
        }
        return cached.response;
      }
      const number = params.p_order_number;
      const order = {
        id: `order-${number}`, order_number: number, customer_id: params.p_customer_id,
        customer_name: params.p_customer.name, customer_email: params.p_customer.email, customer_phone: params.p_customer.phone,
        total_amount: 255000, subtotal: 255000, discount_amount: 0, shipping_amount: 0,
        status: 'CONFIRMED', payment_method: params.p_payment_method, payment_status: 'PENDING',
        shipping_address: params.p_shipping_address, promo_code: params.p_promo_code, notes: params.p_notes,
        guest_access_token_hash: params.p_guest_access_token_hash, guest_access_expires_at: params.p_guest_access_expires_at,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        order_items: params.p_items.map((item: Record<string, any>) => ({ product_id: 'product-cu-001', serial_number: item.serialNumber, name: 'Vintage Silk Shirt', price: 255000, quantity: item.quantity, size: item.size || 'M', image_url: '/shirt.jpg', slug: 'vintage-silk-shirt' })),
      };
      rows.set(number, order);
      const response = {
        id: order.id, orderNumber: number, customerId: order.customer_id,
        customer: params.p_customer, shippingAddress: params.p_shipping_address,
        items: order.order_items.map((item: Record<string, any>) => ({ productId: item.product_id, serialNumber: item.serial_number, name: item.name, price: item.price, quantity: item.quantity, size: item.size, image: item.image_url, slug: item.slug })),
        subtotal: order.subtotal, discount: order.discount_amount, deliveryFee: order.shipping_amount, totalAmount: order.total_amount,
        status: order.status, paymentMethod: order.payment_method, paymentStatus: order.payment_status,
        promoCode: order.promo_code, notes: order.notes, guestAccessToken: null, createdAt: order.created_at,
      };
      idempotency.set(params.p_key_hash, { fingerprint: params.p_fingerprint, response });
      return response;
    },
  };
});
vi.mock('../../src/repositories/settings.repository.js', () => ({
  getConfiguredWhatsappNumber: (value?: string) => value && value.replace(/\D/g, '').length >= 10 ? value : '',
  settingsRepository: {
    getSettings: async () => ({ ...settingsState.data }),
    updateSettings: async (patch: Record<string, unknown>) => (settingsState.data = { ...settingsState.data, ...patch, contentVersion: settingsState.data.contentVersion + 1 }),
    bumpVersion: async () => ++settingsState.data.contentVersion,
  },
}));
vi.mock('../../src/services/supabase.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabase.service.js')>();
  return {
    ...actual,
    getSupabaseAdminClient: () => checkoutState.client,
    isSupabaseCheckoutConfigured: () => true,
    executeStorefrontCheckoutRpc: checkoutState.checkout,
  };
});
import { createApp } from '../../src/app.js';
import { adminAuthService, signSessionToken, verifySessionToken } from '../../src/services/adminAuth.service.js';
import { hashGuestToken, orderService } from '../../src/modules/orders/order.service.js';

const app = createApp();
beforeAll(async () => {
  vi.spyOn(adminAuthService, 'validateSession').mockImplementation(async (token) => verifySessionToken(token));
  checkoutState.reset();
});

const CUSTOMER_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  'circleup-test-customer-jwt-secret-at-least-32-chars';

function createCustomerToken(
  payload: { sub: string; email?: string; phone?: string; role?: string; aud?: string },
  expiresIn: jwt.SignOptions['expiresIn'] = '1h',
): string {
  return jwt.sign(
    { aud: 'authenticated', ...payload },
    CUSTOMER_SECRET,
    { expiresIn, algorithm: 'HS256' },
  );
}

describe('Order & Admin Security Remediation Suite', () => {
  const customerA = {
    id: 'cust-uuid-1111',
    email: 'alice@example.com',
    token: createCustomerToken({
      sub: 'cust-uuid-1111',
      email: 'alice@example.com',
      role: 'authenticated',
    }),
  };

  const customerB = {
    id: 'cust-uuid-2222',
    email: 'bob@example.com',
    token: createCustomerToken({
      sub: 'cust-uuid-2222',
      email: 'bob@example.com',
      role: 'authenticated',
    }),
  };

  const ownerSessionToken = signSessionToken({
    userId: 'owner-01',
    email: 'owner@circleuponline.com',
    name: 'Store Owner',
    role: 'owner',
    csrfToken: 'owner-csrf-token-1234',
    expiresAt: Date.now() + 3600000,
    sessionId: 'fixture-owner-session',
  });

  const staffSessionToken = signSessionToken({
    userId: 'staff-01',
    email: 'staff@circleuponline.com',
    name: 'Store Staff',
    role: 'staff',
    csrfToken: 'staff-csrf-token-5678',
    expiresAt: Date.now() + 3600000,
    sessionId: 'fixture-staff-session',
  });

  // 1. Order Endpoint Protection
  describe('1. Order Endpoint Access Controls', () => {
    it('Unauthenticated order listing returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/orders');
      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('Customer cannot access administrative order listing', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(res.status).toBe(401);
      expect(['UNAUTHORIZED', 'INVALID_SESSION']).toContain(res.body.error.code);
    });

    it('Admin with valid session can access administrative order listing', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${ownerSessionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('Invalid or expired customer JWT is rejected with 401', async () => {
      const expiredToken = jwt.sign({ sub: 'cust-expired', aud: 'authenticated' }, CUSTOMER_SECRET, { expiresIn: -10 });
      const resExpired = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(resExpired.status).toBe(401);
      expect(resExpired.body.error.code).toBe('TOKEN_EXPIRED');

      const tamperedToken = jwt.sign({ sub: 'cust-tampered', aud: 'authenticated' }, 'completely-wrong-secret-key-123456');
      const resTampered = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${tamperedToken}`);
      expect(resTampered.status).toBe(401);
      expect(resTampered.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  // 2. Customer Order Ownership Verification & Customer ID Spoofing Prevention
  describe('2. Customer Order Ownership Verification & ID Spoofing Prevention', () => {
    let orderNumberA: string;

    it('Creates an authenticated order associated strictly with Customer A', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'customer-a-order-key-0001')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({
          customer: {
            name: 'Alice Wonder',
            email: customerA.email,
            phone: '+919876543210',
          },
          shippingAddress: {
            addressLine: '12 Boutique Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400050',
          },
          items: [{ serialNumber: 'CU-001', quantity: 1, size: 'M' }],
          paymentMethod: 'WHATSAPP_UPI',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('orderNumber');
      orderNumberA = res.body.data.orderNumber;
      expect(res.body.data.customerId).toBe(customerA.id);
    });

    it('Unauthenticated guest CANNOT attach an order to an arbitrary customer ID', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'guest-spoof-order-key-0002')
        .send({
          customerId: customerA.id, // Malicious attempt by unauthenticated caller to spoof Customer A
          customer: {
            name: 'Malicious Guest',
            email: 'malicious@example.com',
            phone: '+919999999999',
          },
          shippingAddress: {
            addressLine: '99 Spoof Avenue',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400050',
          },
          items: [{ serialNumber: 'CU-001', quantity: 1, size: 'M' }],
          paymentMethod: 'WHATSAPP_UPI',
        });

      expect(res.status).toBe(201);
      // The order must NOT be associated with Customer A's ID
      expect(res.body.data.customerId).toBeNull();
      // It must be treated as a guest order with a guest access token
      expect(res.body.data).toHaveProperty('guestAccessToken');
    });

    it('Valid verified Customer A can access their own order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderNumberA}`)
        .set('Authorization', `Bearer ${customerA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orderNumber).toBe(orderNumberA);
      expect(res.body.data.customer.email).toBe(customerA.email);
    });

    it('Customer B cannot access Customer A order (returns 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderNumberA}`)
        .set('Authorization', `Bearer ${customerB.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORDER_ACCESS');
    });

    it('Unauthenticated caller cannot access Customer A order even with matching email/phone query params', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderNumberA}?email=${encodeURIComponent(customerA.email)}&phone=9876543210`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORDER_ACCESS');
    });

    it('Admin can access customer order for customer support/fulfillment', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderNumberA}`)
        .set('Authorization', `Bearer ${staffSessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orderNumber).toBe(orderNumberA);
    });
  });

  // 3. Guest Checkout Security & Token Hashing
  describe('3. Guest Checkout Security, Token Hashing & Header Auth', () => {
    let guestOrderNumber: string;
    let rawGuestToken: string;

    it('Places guest order and returns raw token only on checkout response', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'guest-order-token-key-0003')
        .send({
          customer: {
            name: 'Guest Shopper',
            email: 'guest@example.com',
            phone: '+919999888877',
          },
          shippingAddress: {
            addressLine: '88 Thrift Arcade',
            city: 'Bandra',
            state: 'Maharashtra',
            postalCode: '400050',
          },
          items: [{ serialNumber: 'CU-001', quantity: 1, size: 'Free Size' }],
          paymentMethod: 'WHATSAPP_UPI',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('orderNumber');
      expect(res.body.data).toHaveProperty('guestAccessToken');
      expect(typeof res.body.data.guestAccessToken).toBe('string');
      expect(res.body.data.guestAccessToken.length).toBeGreaterThanOrEqual(64);

      guestOrderNumber = res.body.data.orderNumber;
      rawGuestToken = res.body.data.guestAccessToken;
    });

    it('Raw guest token is NOT stored in database (only SHA-256 hash is stored)', async () => {
      const storedOrder = await orderService.getOrderByNumber(guestOrderNumber);
      const expectedHash = hashGuestToken(rawGuestToken);

      // In database/memory, the stored token must match the SHA-256 hash, not the raw token
      expect(storedOrder.guestAccessToken).toBe(expectedHash);
      expect(storedOrder.guestAccessToken).not.toBe(rawGuestToken);
    });

    it('Query-string token authentication (?token=...) is strictly REJECTED (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}?token=${rawGuestToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORDER_ACCESS');
    });

    it('Valid guest access token via x-guest-order-token header allows order tracking (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}`)
        .set('x-guest-order-token', rawGuestToken);

      expect(res.status).toBe(200);
      expect(res.body.data.orderNumber).toBe(guestOrderNumber);
    });

    it('Invalid guest access token is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}`)
        .set('x-guest-order-token', 'tampered_invalid_token_attempt_1234567890abcdef1234567890abcdef');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORDER_ACCESS');
    });

    it('Missing guest token on guest order is rejected with 403', async () => {
      const res = await request(app).get(`/api/v1/orders/${guestOrderNumber}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORDER_ACCESS');
    });

    it('Directly providing the stored SHA-256 hash in x-guest-order-token is strictly REJECTED (P0-5 hardening)', async () => {
      const storedHash = hashGuestToken(rawGuestToken);

      // 1. Attempting to access order with storedHash header fails (403) because hash(storedHash) !== storedHash
      const res = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}`)
        .set('x-guest-order-token', storedHash);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORDER_ACCESS');

      // 2. Direct verifyGuestAccessToken call passing storedHash as providedToken returns false
      const expiresAt = new Date(Date.now() + 86400000);
      expect(
        orderService.verifyGuestAccessToken(
          storedHash,
          storedHash,
          expiresAt,
          guestOrderNumber,
        ),
      ).toBe(false);

      // 3. Legitimate signed token verifies successfully
      expect(
        orderService.verifyGuestAccessToken(
          rawGuestToken,
          storedHash,
          expiresAt,
          guestOrderNumber,
        ),
      ).toBe(true);
    });

    it('Supports guest token rotation and revocation', async () => {
      const initialToken = rawGuestToken;
      const rotatedRawToken = await orderService.rotateGuestAccessToken(guestOrderNumber);
      expect(rotatedRawToken).not.toBe(initialToken);

      // New token works via header
      const resNew = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}`)
        .set('x-guest-order-token', rotatedRawToken);
      expect(resNew.status).toBe(200);

      // Old token no longer works
      const resOld = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}`)
        .set('x-guest-order-token', initialToken);
      expect(resOld.status).toBe(403);

      // Revocation
      await orderService.revokeGuestAccessToken(guestOrderNumber);
      const resRevoked = await request(app)
        .get(`/api/v1/orders/${guestOrderNumber}`)
        .set('x-guest-order-token', rotatedRawToken);
      expect(resRevoked.status).toBe(403);
    });

    it('Dedicated rate limiter blocks excessive order lookup requests with 429', async () => {
      let triggered429 = false;
      const testIp = '198.51.100.99';
      for (let i = 0; i < 35; i++) {
        const res = await request(app)
          .get(`/api/v1/orders/${guestOrderNumber}`)
          .set('x-forwarded-for', testIp);
        if (res.status === 429) {
          triggered429 = true;
          expect(['RATE_LIMITED', 'TOO_MANY_REQUESTS']).toContain(res.body.error.code);
          break;
        }
      }
      expect(triggered429).toBe(true);
    });
  });

  // 4. Server-Side Price & Calculation Integrity
  describe('4. Server-Side Price & Calculation Integrity', () => {
    it('Client-submitted prices cannot override server catalog prices', async () => {
      const tamperedPricePayload = {
        customer: {
          name: 'Attacker Attempt',
          email: 'attacker@example.com',
          phone: '+919000000000',
        },
        shippingAddress: {
          addressLine: '99 Scam Alley',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
        },
        items: [
          {
            serialNumber: 'CU-001',
            price: 1, // Attempt to purchase for 1 paisa (₹0.01) instead of ₹2,550
            quantity: 1,
            size: 'M',
          },
        ],
        subtotal: 1,
        totalAmount: 1,
        paymentStatus: 'PAID', // Attempt to spoof payment status
      };

      const res = await request(app).post('/api/v1/orders')
        .set('Idempotency-Key', 'tampered-price-key-0004')
        .send(tamperedPricePayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // 5. Admin Role Enforcement & Owner-Only Endpoints
  describe('5. Admin Role Enforcement & Owner-Only Boundaries', () => {
    it('Staff cannot delete rentals (requires owner role)', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/rentals/rental-123')
        .set('Authorization', `Bearer ${staffSessionToken}`)
        .set('X-CSRF-Token', 'staff-csrf-token-5678');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('Staff cannot delete events (requires owner role)', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/events/event-123')
        .set('Authorization', `Bearer ${staffSessionToken}`)
        .set('X-CSRF-Token', 'staff-csrf-token-5678');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('Staff cannot permanently delete products (requires owner role or products:delete permission)', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/products/prod-123/permanent')
        .set('Authorization', `Bearer ${staffSessionToken}`)
        .set('X-CSRF-Token', 'staff-csrf-token-5678');

      expect(res.status).toBe(403);
      expect(['FORBIDDEN_ROLE', 'FORBIDDEN_PERMISSION']).toContain(res.body.error.code);
    });

    it('Staff cannot mutate site settings (requires owner role)', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${staffSessionToken}`)
        .set('X-CSRF-Token', 'staff-csrf-token-5678')
        .send({ storeName: 'Hacked Store' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });
});
