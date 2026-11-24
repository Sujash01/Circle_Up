import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env, envSchema } from '../../src/config/env.js';
import { orderService } from '../../src/modules/orders/order.service.js';
import * as supabaseService from '../../src/services/supabase.service.js';
import {
  createRazorpayOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  setRazorpayGatewayClientForTesting,
} from '../../src/services/razorpay.service.js';

describe('Razorpay Direct Checkout & Verification Lifecycle', () => {
  const app = createApp();
  const originalEnv = { ...env };

  afterEach(() => {
    Object.assign(env, originalEnv);
    supabaseService.resetSupabaseClientForTesting();
    setRazorpayGatewayClientForTesting(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects new Cash on Delivery orders at checkout with PAYMENT_METHOD_DISALLOWED', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', 'test-cod-disallowed-key-001')
      .send({
        customer: {
          name: 'Priya Sharma',
          email: 'priya@example.com',
          phone: '+919876543210',
        },
        shippingAddress: {
          addressLine: '10 Marine Drive',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400020',
        },
        items: [
          {
            serialNumber: 'CU-001',
            quantity: 1,
            size: 'M',
          },
        ],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PAYMENT_METHOD_DISALLOWED');
    expect(res.body.error.message).toMatch(/Cash on Delivery is no longer available/i);
  });

  it('preserves integer paise in Razorpay order creation', async () => {
    setRazorpayGatewayClientForTesting({
      createOrder: async (input) => ({
        id: 'order_test_mock123',
        amount: input.amountPaise,
        currency: 'INR',
        receipt: input.internalOrderNumber,
        status: 'created',
      }),
      fetchPayment: async () => null,
      fetchOrder: async () => null,
      fetchOrderByReceipt: async () => null,
      fetchOrderPayments: async () => [],
      createRefund: async () => { throw new Error('Unexpected refund call'); },
      fetchPaymentRefunds: async () => [],
    });

    // 2550 INR = 255000 paise
    const amountInPaise = 255000;
    const internalOrderNumber = 'ORD-261123-A1B2C3D4E5F6';

    const order = await createRazorpayOrder({
      amountPaise: amountInPaise,
      internalOrderNumber,
    });

    expect(order).toBeDefined();
    expect(order.amount).toBe(255000);
    expect(order.currency).toBe('INR');
  });

  it('accepts valid payment signatures and rejects fraudulent signatures', () => {
    const secret = 'synthetic-test-secret-fixture-only';
    const orderId = 'order_test_987654';
    const paymentId = 'pay_test_123456';
    const validSignature = createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature: validSignature,
      customSecret: secret,
    })).toBe(true);

    expect(verifyRazorpayPaymentSignature({
      orderId: 'order_test_tampered',
      paymentId,
      signature: validSignature,
      customSecret: secret,
    })).toBe(false);

    expect(verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature: 'bad-signature-of-invalid-length',
      customSecret: secret,
    })).toBe(false);
  });

  it('validates webhook signatures against raw request buffer', () => {
    const webhookSecret = 'synthetic-webhook-secret-fixture-only';
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
    const validSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    expect(verifyRazorpayWebhookSignature(rawBody, validSignature, webhookSecret)).toBe(true);
    expect(verifyRazorpayWebhookSignature(Buffer.from('tampered body'), validSignature, webhookSecret)).toBe(false);
  });

  it('allows production startup without Razorpay credentials and keeps signing secrets required', () => {
    const baseProdEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-with-sufficient-length',
      SESSION_SECRET: 'circleup-production-session-secret-at-least-32-chars',
      JWT_ACCESS_SECRET: 'circleup-production-jwt-access-secret-32-chars',
      JWT_ADMIN_ACCESS_SECRET: 'circleup-production-jwt-admin-secret-at-least-32',
      GUEST_ORDER_TOKEN_SECRET: 'circleup-production-guest-token-secret-at-least-32',
      CRON_SECRET: 'circleup-cron-secret-16',
      MONETARY_RECONCILIATION_VERIFIED: 'true',
    };

    expect(envSchema.parse(baseProdEnv).RAZORPAY_ENABLED).toBe(false);
    expect(envSchema.parse({ ...baseProdEnv, RAZORPAY_ENABLED: 'true' }).RAZORPAY_ENABLED).toBe(true);
    expect(envSchema.safeParse({ ...baseProdEnv, RAZORPAY_ENABLED: '1' }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseProdEnv, JWT_ADMIN_ACCESS_SECRET: '' }).success).toBe(false);
  });

  it.each(['RAZORPAY', 'ONLINE_UPI', undefined])(
    'rejects an unavailable %s checkout before reservation',
    async (paymentMethod) => {
      env.RAZORPAY_ENABLED = false;
      const checkoutRpc = vi.spyOn(supabaseService, 'executeStorefrontCheckoutRpc');
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'disabled-online-checkout-001')
        .send({
          customer: { name: 'Priya Sharma', email: 'priya@example.com', phone: '+919876543210' },
          shippingAddress: { addressLine: '10 Marine Drive', city: 'Mumbai', state: 'Maharashtra', postalCode: '400020' },
          items: [{ serialNumber: 'CU-001', quantity: 1 }],
          paymentMethod,
        });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect(checkoutRpc).not.toHaveBeenCalled();
    },
  );

  it('reports uncached availability without disclosing credentials', async () => {
    env.NODE_ENV = 'production';
    env.SUPABASE_URL = 'https://circleup-qa.invalid';
    env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role-for-unit-tests';
    env.RAZORPAY_MODE = 'test';
    env.RAZORPAY_ENABLED = true;
    env.RAZORPAY_KEY_ID = 'rzp_test_synthetic_fixture_only';
    env.RAZORPAY_KEY_SECRET = undefined;
    env.MONETARY_RECONCILIATION_VERIFIED = true;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external requests in this test')));
    const path = '/api/v1/payments/razorpay/availability';

    const unavailable = await request(app).get(path);
    expect(unavailable.status).toBe(200);
    expect(unavailable.body.data).toEqual({ available: false });
    expect(unavailable.headers['cache-control']).toContain('no-store');

    env.RAZORPAY_KEY_SECRET = 'synthetic-test-secret-fixture-only';
    expect((await request(app).get(path)).body.data).toEqual({ available: true });
    env.MONETARY_RECONCILIATION_VERIFIED = false;
    expect((await request(app).get(path)).body.data).toEqual({ available: false });
  });

  it('POST /api/v1/payments/razorpay/verify validates required fields', async () => {
    const res = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/payments/razorpay/cancel requires order access authorization', async () => {
    vi.spyOn(orderService, 'getOrderByNumber').mockResolvedValueOnce(null as any);
    const res = await request(app)
      .post('/api/v1/payments/razorpay/cancel')
      .send({
        orderNumber: 'ORD-NONEXISTENT-9999',
      });

    // Should return 404 for unknown order or 401 for unauthorized
    expect([401, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

