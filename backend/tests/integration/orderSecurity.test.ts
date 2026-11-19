import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signSessionToken } from '../../src/services/adminAuth.service.js';
import { hashGuestToken, orderService } from '../../src/modules/orders/order.service.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/testDatabase.js';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';

const app = createApp();
let testDatabase: MongoMemoryReplSet;

beforeAll(async () => {
  testDatabase = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  if (testDatabase) await stopTestDatabase(testDatabase);
});

const CUSTOMER_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  'circleup-customer-jwt-secret-at-least-32-chars';

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
  });

  const staffSessionToken = signSessionToken({
    userId: 'staff-01',
    email: 'staff@circleuponline.com',
    name: 'Store Staff',
    role: 'staff',
    csrfToken: 'staff-csrf-token-5678',
    expiresAt: Date.now() + 3600000,
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
          paymentMethod: 'CASH_ON_DELIVERY',
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
          paymentMethod: 'CASH_ON_DELIVERY',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('orderNumber');
      expect(res.body.data).toHaveProperty('guestAccessToken');
      expect(typeof res.body.data.guestAccessToken).toBe('string');
      expect(res.body.data.guestAccessToken.length).toBe(64); // 32 bytes hex = 64 chars

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

    it('Handles legacy existing guest orders stored with plaintext tokens safely (backward compatibility)', () => {
      const legacyRawToken = 'legacy_plaintext_guest_token_12345678901234567890123456789012';
      const expiresAt = new Date(Date.now() + 86400000);

      // Verify that verifyGuestAccessToken succeeds when stored value was the plaintext token
      const legacyValid = orderService.verifyGuestAccessToken(
        legacyRawToken,
        legacyRawToken, // stored as plaintext before migration
        expiresAt,
      );
      expect(legacyValid).toBe(true);

      // Verify that verifyGuestAccessToken succeeds when stored value was hashed
      const hashedStored = hashGuestToken(legacyRawToken);
      const hashedValid = orderService.verifyGuestAccessToken(
        legacyRawToken,
        hashedStored,
        expiresAt,
      );
      expect(hashedValid).toBe(true);

      // Verify that wrong token fails against legacy order
      const wrongLegacy = orderService.verifyGuestAccessToken(
        'wrong_token',
        legacyRawToken,
        expiresAt,
      );
      expect(wrongLegacy).toBe(false);
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

    it('Staff cannot permanently delete products (requires owner role)', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/products/prod-123/permanent')
        .set('Authorization', `Bearer ${staffSessionToken}`)
        .set('X-CSRF-Token', 'staff-csrf-token-5678');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
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
