import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const razorpayEnv = vi.hoisted(() => ({
  RAZORPAY_MODE: 'test',
  RAZORPAY_KEY_ID: 'rzp_test_synthetic_fixture_only',
  RAZORPAY_KEY_SECRET: 'synthetic-test-secret-fixture-only',
  RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret-fixture-only',
}));

vi.mock('../../src/config/env.js', () => ({ env: razorpayEnv }));

import {
  createRazorpayTestOrder,
  isCapturedPaymentForOrder,
  isRazorpayTestConfigurationAvailable,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../../src/services/razorpay.service.js';

const paymentSignature = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');

describe('Razorpay test-mode integration foundation', () => {
  beforeEach(() => {
    razorpayEnv.RAZORPAY_MODE = 'test';
    razorpayEnv.RAZORPAY_KEY_ID = 'rzp_test_synthetic_fixture_only';
    razorpayEnv.RAZORPAY_KEY_SECRET = 'synthetic-test-secret-fixture-only';
    razorpayEnv.RAZORPAY_WEBHOOK_SECRET = 'synthetic-webhook-secret-fixture-only';
  });

  afterEach(() => vi.unstubAllGlobals());

  it('creates a Razorpay order server-side with only the trusted amount and internal receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'order_test123', amount: 255000, currency: 'INR', receipt: 'ORD-261119-1234', status: 'created',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const order = await createRazorpayTestOrder({ amountPaise: 255000, internalOrderNumber: 'ORD-261119-1234' });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(order.id).toBe('order_test123');
    expect(JSON.parse(String(request.body))).toMatchObject({
      amount: 255000, currency: 'INR', receipt: 'ORD-261119-1234',
      notes: { internalOrderNumber: 'ORD-261119-1234' },
    });
    expect(String((request.headers as Record<string, string>).Authorization)).toContain('Basic ');
  });

  it('does not contact Razorpay when test credentials are missing or are not test keys', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    razorpayEnv.RAZORPAY_KEY_ID = '';
    razorpayEnv.RAZORPAY_KEY_SECRET = '';
    razorpayEnv.RAZORPAY_WEBHOOK_SECRET = '';
    expect(isRazorpayTestConfigurationAvailable()).toBe(false);
    razorpayEnv.RAZORPAY_KEY_ID = 'rzp_test_replace-with-test-key-id';
    razorpayEnv.RAZORPAY_KEY_SECRET = 'replace-with-test-key-secret';
    razorpayEnv.RAZORPAY_WEBHOOK_SECRET = 'replace-with-test-webhook-secret';
    expect(isRazorpayTestConfigurationAvailable()).toBe(false);
    razorpayEnv.RAZORPAY_KEY_ID = 'rzp_live_never-allowed';
    await expect(createRazorpayTestOrder({ amountPaise: 100, internalOrderNumber: 'ORD-261119-1234' }))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid server-calculated amounts and provider responses that mismatch the request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createRazorpayTestOrder({ amountPaise: 1.5, internalOrderNumber: 'ORD-261119-1234' }))
      .rejects.toMatchObject({ code: 'INVALID_PAYMENT_ORDER' });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: 'order_test123', amount: 1, currency: 'INR', receipt: 'ORD-261119-1234', status: 'created',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(createRazorpayTestOrder({ amountPaise: 255000, internalOrderNumber: 'ORD-261119-1234' }))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_INVALID_RESPONSE' });
  });

  it('accepts only a valid Razorpay payment signature', () => {
    const signature = paymentSignature('synthetic-test-secret-fixture-only', 'order_123|pay_456');
    expect(verifyRazorpayPaymentSignature({ orderId: 'order_123', paymentId: 'pay_456', signature })).toBe(true);
    expect(verifyRazorpayPaymentSignature({ orderId: 'order_other', paymentId: 'pay_456', signature })).toBe(false);
    expect(verifyRazorpayPaymentSignature({ orderId: 'order_123', paymentId: 'pay_456', signature: 'bad' })).toBe(false);
  });

  it('validates webhook signatures against the exact raw request bytes', () => {
    const rawBody = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = paymentSignature('synthetic-webhook-secret-fixture-only', rawBody.toString());
    expect(verifyRazorpayWebhookSignature(rawBody, signature)).toBe(true);
    expect(verifyRazorpayWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature)).toBe(false);
  });

  it('requires captured payment, matching provider order, internal order, amount, and INR currency', () => {
    const evidence = {
      id: 'pay_test123', order_id: 'order_test123', amount: 255000, currency: 'INR', status: 'captured',
      notes: { internalOrderNumber: 'ORD-261119-1234' },
    };
    const expected = { providerOrderId: 'order_test123', internalOrderNumber: 'ORD-261119-1234', amountPaise: 255000 };
    expect(isCapturedPaymentForOrder(evidence, expected)).toBe(true);
    expect(isCapturedPaymentForOrder({ ...evidence, amount: 254999 }, expected)).toBe(false);
    expect(isCapturedPaymentForOrder({ ...evidence, currency: 'USD' }, expected)).toBe(false);
    expect(isCapturedPaymentForOrder({ ...evidence, order_id: 'order_wrong' }, expected)).toBe(false);
    expect(isCapturedPaymentForOrder({ ...evidence, notes: { internalOrderNumber: 'ORD-OTHER' } }, expected)).toBe(false);
    expect(isCapturedPaymentForOrder({ ...evidence, status: 'authorized' }, expected)).toBe(false);
    expect(isCapturedPaymentForOrder({ ...evidence, status: 'failed' }, expected)).toBe(false);
  });
});
