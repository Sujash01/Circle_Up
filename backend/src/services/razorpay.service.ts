import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ServiceUnavailableError, UnprocessableEntityError } from '../errors/AppError.js';

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

export interface RazorpayTestOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface RazorpayPaymentEvidence {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: { internalOrderNumber?: string };
}

function testCredentials() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_WEBHOOK_SECRET: webhookSecret } = env;
  const hasPlaceholder = [keyId, keySecret, webhookSecret].some((value) => value && /^(replace|your[-_]|<)/i.test(value.trim()));
  if (
    env.RAZORPAY_MODE !== 'test' ||
    !keyId?.startsWith('rzp_test_') ||
    !keySecret?.trim() ||
    !webhookSecret?.trim() ||
    hasPlaceholder
  ) return undefined;
  return { keyId, keySecret, webhookSecret };
}

export function isRazorpayTestConfigurationAvailable(): boolean {
  return Boolean(testCredentials());
}

/**
 * Safe test-mode provider foundation. This is deliberately not called by checkout
 * until the internal order/payment transaction and webhook lifecycle are wired.
 */
export async function createRazorpayTestOrder(input: {
  amountPaise: number;
  internalOrderNumber: string;
}): Promise<RazorpayTestOrder> {
  const credentials = testCredentials();
  if (!credentials) {
    throw new ServiceUnavailableError('Razorpay test credentials are not configured.', 'PAYMENT_PROVIDER_UNAVAILABLE');
  }
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || !/^ORD-[A-Z0-9-]{6,64}$/.test(input.internalOrderNumber)) {
    throw new UnprocessableEntityError('Server-calculated payment amount or order reference is invalid.', 'INVALID_PAYMENT_ORDER');
  }

  const response = await fetch(RAZORPAY_ORDERS_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.internalOrderNumber,
      notes: { internalOrderNumber: input.internalOrderNumber },
    }),
  });
  if (!response.ok) {
    throw new ServiceUnavailableError('Razorpay test order could not be created.', 'PAYMENT_PROVIDER_UNAVAILABLE');
  }
  const result = await response.json() as Partial<RazorpayTestOrder>;
  if (
    typeof result.id !== 'string' || !result.id.startsWith('order_') ||
    result.amount !== input.amountPaise || result.currency !== 'INR' ||
    result.receipt !== input.internalOrderNumber || result.status !== 'created'
  ) {
    throw new ServiceUnavailableError('Razorpay returned an invalid test order response.', 'PAYMENT_PROVIDER_INVALID_RESPONSE');
  }
  return result as RazorpayTestOrder;
}

function signatureMatches(message: string | Buffer, providedSignature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(providedSignature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  const actual = Buffer.from(providedSignature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyRazorpayPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const credentials = testCredentials();
  if (!credentials || !input.orderId || !input.paymentId) return false;
  return signatureMatches(`${input.orderId}|${input.paymentId}`, input.signature, credentials.keySecret);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const credentials = testCredentials();
  if (!credentials) return false;
  return signatureMatches(rawBody, signature, credentials.webhookSecret);
}

/** A payment is eligible for a future PAID transition only with verified captured evidence. */
export function isCapturedPaymentForOrder(
  evidence: RazorpayPaymentEvidence,
  expected: { providerOrderId: string; internalOrderNumber: string; amountPaise: number },
): boolean {
  return Boolean(
    evidence.id?.startsWith('pay_') &&
    evidence.status === 'captured' &&
    evidence.order_id === expected.providerOrderId &&
    evidence.amount === expected.amountPaise &&
    evidence.currency === 'INR' &&
    evidence.notes?.internalOrderNumber === expected.internalOrderNumber,
  );
}
