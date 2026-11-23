import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { envSchema } from '../../src/config/env.js';
import {
  createRazorpayOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../../src/services/razorpay.service.js';

describe('Razorpay Direct Checkout & Verification Lifecycle', () => {
  const app = createApp();

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
    })).toBe(true);

    expect(verifyRazorpayPaymentSignature({
      orderId: 'order_test_tampered',
      paymentId,
      signature: validSignature,
    })).toBe(false);

    expect(verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature: 'bad-signature-of-invalid-length',
    })).toBe(false);
  });

  it('validates webhook signatures against raw request buffer', () => {
    const webhookSecret = 'synthetic-webhook-secret-fixture-only';
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
    const validSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    expect(verifyRazorpayWebhookSignature(rawBody, validSignature)).toBe(true);
    expect(verifyRazorpayWebhookSignature(Buffer.from('tampered body'), validSignature)).toBe(false);
  });

  it('enforces RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in production env configuration', () => {
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

    // Missing Razorpay keys
    const missingKeys = envSchema.safeParse(baseProdEnv);
    expect(missingKeys.success).toBe(false);
    if (!missingKeys.success) {
      const fieldErrors = missingKeys.error.flatten().fieldErrors;
      expect(fieldErrors.RAZORPAY_KEY_ID).toBeDefined();
      expect(fieldErrors.RAZORPAY_KEY_SECRET).toBeDefined();
    }

    // Insecure placeholder keys
    const placeholderKeys = envSchema.safeParse({
      ...baseProdEnv,
      RAZORPAY_KEY_ID: 'replace-with-your-key',
      RAZORPAY_KEY_SECRET: 'replace-with-your-secret',
    });
    expect(placeholderKeys.success).toBe(false);
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

