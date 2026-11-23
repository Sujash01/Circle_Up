import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ServiceUnavailableError, UnprocessableEntityError } from '../errors/AppError.js';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

export interface RazorpayTestOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export type RazorpayOrder = RazorpayTestOrder;

export interface RazorpayPaymentEvidence {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: { internalOrderNumber?: string };
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export function getRazorpayCredentials(): RazorpayCredentials | undefined {
  const {
    RAZORPAY_KEY_ID: keyId,
    RAZORPAY_KEY_SECRET: keySecret,
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  } = env;

  const hasPlaceholder = [keyId, keySecret].some(
    (value) => value && /^(replace|your[-_]|<)/i.test(value.trim()),
  );

  if (
    !keyId?.trim() ||
    !keySecret?.trim() ||
    hasPlaceholder
  ) {
    return undefined;
  }

  // In test mode, keys must start with rzp_test_ (unless in automated test runner)
  if (env.RAZORPAY_MODE === 'test' && !keyId.startsWith('rzp_test_') && env.NODE_ENV !== 'test') {
    return undefined;
  }

  return {
    keyId: keyId.trim(),
    keySecret: keySecret.trim(),
    webhookSecret: webhookSecret?.trim(),
  };
}

export function isRazorpayConfigurationAvailable(): boolean {
  return Boolean(getRazorpayCredentials());
}

export const isRazorpayTestConfigurationAvailable = isRazorpayConfigurationAvailable;

/**
 * Creates an authoritative Razorpay order server-side with integer paise amount.
 */
export async function createRazorpayOrder(input: {
  amountPaise: number;
  internalOrderNumber: string;
  notes?: Record<string, string>;
}): Promise<RazorpayTestOrder> {
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    throw new ServiceUnavailableError(
      'Razorpay test credentials are not configured.',
      'PAYMENT_PROVIDER_UNAVAILABLE',
    );
  }
  if (
    !Number.isSafeInteger(input.amountPaise) ||
    input.amountPaise <= 0 ||
    !/^ORD-[A-Z0-9-]{6,64}$/.test(input.internalOrderNumber)
  ) {
    throw new UnprocessableEntityError(
      'Server-calculated payment amount or order reference is invalid.',
      'INVALID_PAYMENT_ORDER',
    );
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
      notes: {
        internalOrderNumber: input.internalOrderNumber,
        ...input.notes,
      },
    }),
  });

  if (!response.ok) {
    throw new ServiceUnavailableError(
      'Razorpay test order could not be created.',
      'PAYMENT_PROVIDER_UNAVAILABLE',
    );
  }

  const result = (await response.json()) as Partial<RazorpayTestOrder>;
  if (
    typeof result.id !== 'string' ||
    !result.id.startsWith('order_') ||
    result.amount !== input.amountPaise ||
    result.currency !== 'INR' ||
    result.receipt !== input.internalOrderNumber ||
    result.status !== 'created'
  ) {
    throw new ServiceUnavailableError(
      'Razorpay returned an invalid test order response.',
      'PAYMENT_PROVIDER_INVALID_RESPONSE',
    );
  }

  return result as RazorpayTestOrder;
}

export const createRazorpayTestOrder = createRazorpayOrder;

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
  const credentials = getRazorpayCredentials();
  if (!credentials || !input.orderId || !input.paymentId) return false;
  return signatureMatches(`${input.orderId}|${input.paymentId}`, input.signature, credentials.keySecret);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const credentials = getRazorpayCredentials();
  if (!credentials || !credentials.webhookSecret) return false;
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

/**
 * Transitions order payment status to PAID and status to CONFIRMED via Supabase RPC.
 */
export async function markOrderPaidViaRazorpay(input: {
  orderNumber: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured()) {
    throw new ServiceUnavailableError('Database is unavailable.', 'DATABASE_UNAVAILABLE');
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.rpc('storefront_verify_razorpay_payment', {
    p_order_number: input.orderNumber.trim().toUpperCase(),
    p_razorpay_order_id: input.razorpayOrderId.trim(),
    p_razorpay_payment_id: input.razorpayPaymentId.trim(),
    p_razorpay_signature: input.razorpaySignature.trim(),
  });

  if (error) {
    throw new ServiceUnavailableError(
      `Payment confirmation failed: ${error.message}`,
      'PAYMENT_VERIFICATION_FAILED',
    );
  }

  return (data || {}) as Record<string, unknown>;
}

/**
 * Cancels a pending reservation and releases reserved item stock back to catalog.
 */
export async function cancelPendingRazorpayReservation(
  orderNumber: string,
  reason: string = 'Checkout dismissed or payment failed',
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.rpc('storefront_cancel_pending_order', {
    p_order_number: orderNumber.trim().toUpperCase(),
    p_reason: reason.trim(),
  });

  if (error) {
    throw new ServiceUnavailableError(
      `Failed to release reservation: ${error.message}`,
      'DATABASE_UNAVAILABLE',
    );
  }

  return Boolean(data);
}
