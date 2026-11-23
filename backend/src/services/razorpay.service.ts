import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ServiceUnavailableError, UnprocessableEntityError, BadRequestError } from '../errors/AppError.js';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';
const RAZORPAY_PAYMENTS_URL = 'https://api.razorpay.com/v1/payments';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export type RazorpayTestOrder = RazorpayOrder;

export interface RazorpayPaymentEvidence {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
}

export interface RazorpayRefundEvidence {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export interface IRazorpayGatewayClient {
  createOrder(params: {
    amountPaise: number;
    internalOrderNumber: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder>;

  fetchPayment(paymentId: string): Promise<RazorpayPaymentEvidence | null>;

  fetchOrder(orderId: string): Promise<RazorpayOrder | null>;

  fetchOrderByReceipt(receipt: string): Promise<RazorpayOrder | null>;

  fetchOrderPayments(orderId: string): Promise<RazorpayPaymentEvidence[]>;

  createRefund(params: {
    paymentId: string;
    amountPaise: number;
    idempotencyKey: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayRefundEvidence>;

  fetchPaymentRefunds(paymentId: string): Promise<RazorpayRefundEvidence[]>;
}

class DefaultRazorpayGatewayClient implements IRazorpayGatewayClient {
  async createOrder(params: {
    amountPaise: number;
    internalOrderNumber: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
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
        amount: params.amountPaise,
        currency: 'INR',
        receipt: params.internalOrderNumber,
        notes: {
          internalOrderNumber: params.internalOrderNumber,
          ...params.notes,
        },
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableError(
        'Razorpay order could not be created.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const result = (await response.json()) as Partial<RazorpayOrder>;
    if (
      typeof result.id !== 'string' ||
      !result.id.startsWith('order_') ||
      result.amount !== params.amountPaise ||
      result.currency !== 'INR' ||
      result.receipt !== params.internalOrderNumber ||
      result.status !== 'created'
    ) {
      throw new ServiceUnavailableError(
        'Razorpay returned an invalid order response.',
        'PAYMENT_PROVIDER_INVALID_RESPONSE',
      );
    }

    return result as RazorpayOrder;
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPaymentEvidence | null> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const response = await fetch(`${RAZORPAY_PAYMENTS_URL}/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Failed to fetch payment evidence from Razorpay: HTTP ${response.status}`,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const data = (await response.json()) as Partial<RazorpayPaymentEvidence>;
    if (
      typeof data.id !== 'string' ||
      typeof data.order_id !== 'string' ||
      typeof data.amount !== 'number' ||
      typeof data.status !== 'string' ||
      typeof data.currency !== 'string'
    ) {
      throw new ServiceUnavailableError(
        'Razorpay returned malformed payment evidence.',
        'PAYMENT_PROVIDER_INVALID_RESPONSE',
      );
    }

    return data as RazorpayPaymentEvidence;
  }

  async fetchOrder(orderId: string): Promise<RazorpayOrder | null> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const response = await fetch(`${RAZORPAY_ORDERS_URL}/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Failed to fetch order details from Razorpay: HTTP ${response.status}`,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const data = (await response.json()) as Partial<RazorpayOrder>;
    return data as RazorpayOrder;
  }

  async fetchOrderByReceipt(receipt: string): Promise<RazorpayOrder | null> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const response = await fetch(`${RAZORPAY_ORDERS_URL}?receipt=${encodeURIComponent(receipt)}&count=1`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Failed to query order by receipt from Razorpay: HTTP ${response.status}`,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const data = (await response.json()) as { items?: Partial<RazorpayOrder>[] };
    const found = (data.items || []).find((item) => item.receipt === receipt);
    return (found as RazorpayOrder) || null;
  }

  async fetchOrderPayments(orderId: string): Promise<RazorpayPaymentEvidence[]> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const response = await fetch(`${RAZORPAY_ORDERS_URL}/${encodeURIComponent(orderId)}/payments`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Failed to query order payments from Razorpay: HTTP ${response.status}`,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const data = (await response.json()) as { items?: Partial<RazorpayPaymentEvidence>[] };
    return (data.items || []) as RazorpayPaymentEvidence[];
  }

  async createRefund(params: {
    paymentId: string;
    amountPaise: number;
    idempotencyKey: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayRefundEvidence> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const response = await fetch(`${RAZORPAY_PAYMENTS_URL}/${encodeURIComponent(params.paymentId)}/refund`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'X-Razorpay-Idempotency': params.idempotencyKey,
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        notes: params.notes,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Failed to create refund via Razorpay: HTTP ${response.status}`,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const data = (await response.json()) as Partial<RazorpayRefundEvidence>;
    return data as RazorpayRefundEvidence;
  }

  async fetchPaymentRefunds(paymentId: string): Promise<RazorpayRefundEvidence[]> {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
      throw new ServiceUnavailableError(
        'Razorpay credentials are not configured.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const response = await fetch(`${RAZORPAY_PAYMENTS_URL}/${encodeURIComponent(paymentId)}/refunds`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Failed to query payment refunds from Razorpay: HTTP ${response.status}`,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    const data = (await response.json()) as { items?: Partial<RazorpayRefundEvidence>[] };
    return (data.items || []) as RazorpayRefundEvidence[];
  }
}

let activeGatewayClient: IRazorpayGatewayClient = new DefaultRazorpayGatewayClient();

/**
 * Allows injecting an isolated gateway client for testing without relying on environment flags.
 */
export function setRazorpayGatewayClientForTesting(client: IRazorpayGatewayClient | null): void {
  activeGatewayClient = client || new DefaultRazorpayGatewayClient();
}

export function getRazorpayGatewayClient(): IRazorpayGatewayClient {
  return activeGatewayClient;
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
}): Promise<RazorpayOrder> {
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

  return activeGatewayClient.createOrder(input);
}

export const createRazorpayTestOrder = createRazorpayOrder;

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPaymentEvidence | null> {
  if (!paymentId || !paymentId.trim()) return null;
  return activeGatewayClient.fetchPayment(paymentId.trim());
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder | null> {
  if (!orderId || !orderId.trim()) return null;
  return activeGatewayClient.fetchOrder(orderId.trim());
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
  customSecret?: string;
}): boolean {
  const secret = input.customSecret || getRazorpayCredentials()?.keySecret;
  if (!secret || !input.orderId || !input.paymentId) return false;
  return signatureMatches(`${input.orderId}|${input.paymentId}`, input.signature, secret);
}

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string,
  customSecret?: string,
): boolean {
  const secret = customSecret || getRazorpayCredentials()?.webhookSecret;
  if (!secret || !signature) return false;
  return signatureMatches(rawBody, signature, secret);
}

/**
 * Validates server-side payment evidence strictly against expected order parameters.
 */
export function validateCapturedPaymentForOrder(
  evidence: RazorpayPaymentEvidence,
  expected: { providerOrderId: string; internalOrderNumber: string; amountPaise: number },
): { valid: boolean; reason?: string } {
  if (!evidence.id || !evidence.id.startsWith('pay_')) {
    return { valid: false, reason: 'Invalid payment identifier format.' };
  }
  if (evidence.status !== 'captured') {
    return { valid: false, reason: `Payment status is "${evidence.status}"; must be "captured".` };
  }
  if (evidence.order_id !== expected.providerOrderId) {
    return {
      valid: false,
      reason: `Payment order_id "${evidence.order_id}" does not match internal provider reference "${expected.providerOrderId}".`,
    };
  }
  if (evidence.amount !== expected.amountPaise) {
    return {
      valid: false,
      reason: `Payment amount (${evidence.amount} paise) does not match internal order total (${expected.amountPaise} paise).`,
    };
  }
  if (evidence.currency !== 'INR') {
    return { valid: false, reason: `Payment currency "${evidence.currency}" is not INR.` };
  }
  if (
    evidence.notes?.internalOrderNumber &&
    evidence.notes.internalOrderNumber !== expected.internalOrderNumber
  ) {
    return {
      valid: false,
      reason: `Payment note internalOrderNumber "${evidence.notes.internalOrderNumber}" does not match "${expected.internalOrderNumber}".`,
    };
  }
  return { valid: true };
}

export function isCapturedPaymentForOrder(
  evidence: RazorpayPaymentEvidence,
  expected: { providerOrderId: string; internalOrderNumber: string; amountPaise: number },
): boolean {
  return validateCapturedPaymentForOrder(evidence, expected).valid;
}

/**
 * Attaches the created Razorpay order ID to the internal database order.
 */
export async function attachRazorpayOrderIdToOrder(
  orderNumber: string,
  razorpayOrderId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    throw new ServiceUnavailableError('Database is unavailable.', 'DATABASE_UNAVAILABLE');
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.rpc('storefront_attach_razorpay_order_id', {
    p_order_number: orderNumber.trim().toUpperCase(),
    p_razorpay_order_id: razorpayOrderId.trim(),
  });

  if (error) {
    throw new ServiceUnavailableError(
      `Failed to bind Razorpay order ID: ${error.message}`,
      'DATABASE_UNAVAILABLE',
    );
  }

  return Boolean(data);
}

/**
 * Transitions order payment status to PAID and status to CONFIRMED via Supabase RPC.
 * Mandates server-verified payment amount and enables atomic webhook event ledger finalization.
 */
export async function markOrderPaidViaRazorpay(input: {
  orderNumber: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  verifiedAmountPaise: number;
  webhookEventId?: string;
}): Promise<Record<string, unknown>> {
  if (
    input.verifiedAmountPaise === undefined ||
    input.verifiedAmountPaise === null ||
    !Number.isInteger(input.verifiedAmountPaise) ||
    input.verifiedAmountPaise <= 0
  ) {
    throw new BadRequestError(
      'Payment verification requires a valid positive integer verified amount in paise.',
      'PAYMENT_AMOUNT_VERIFICATION_REQUIRED',
    );
  }

  if (!isSupabaseConfigured()) {
    throw new ServiceUnavailableError('Database is unavailable.', 'DATABASE_UNAVAILABLE');
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.rpc('storefront_verify_razorpay_payment', {
    p_order_number: input.orderNumber.trim().toUpperCase(),
    p_razorpay_order_id: input.razorpayOrderId.trim(),
    p_razorpay_payment_id: input.razorpayPaymentId.trim(),
    p_razorpay_signature: input.razorpaySignature.trim(),
    p_verified_amount_paise: input.verifiedAmountPaise,
    p_webhook_event_id: input.webhookEventId || null,
  });

  if (error) {
    throw new BadRequestError(
      `Payment confirmation failed: ${error.message}`,
      'PAYMENT_VERIFICATION_FAILED',
    );
  }

  return (data || {}) as Record<string, unknown>;
}

/**
 * Claims a webhook event with a recoverable lease to guarantee transactional idempotency and crash recovery.
 */
export async function claimRazorpayWebhookEvent(input: {
  eventId: string;
  eventType: string;
  orderNumber?: string;
  paymentId?: string;
  payload?: Record<string, unknown>;
  leaseSeconds?: number;
}): Promise<'CLAIMED' | 'ALREADY_PROCESSED' | 'CONCURRENTLY_PROCESSING'> {
  if (!isSupabaseConfigured()) {
    throw new ServiceUnavailableError('Database is unavailable.', 'DATABASE_UNAVAILABLE');
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.rpc('razorpay_claim_webhook_event', {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_order_number: input.orderNumber || null,
    p_payment_id: input.paymentId || null,
    p_payload: input.payload || null,
    p_lease_seconds: input.leaseSeconds || 120,
  });

  if (error) {
    throw new ServiceUnavailableError(`Failed to claim webhook event: ${error.message}`, 'DATABASE_UNAVAILABLE');
  }

  return (data as 'CLAIMED' | 'ALREADY_PROCESSED' | 'CONCURRENTLY_PROCESSING') || 'CLAIMED';
}

/**
 * Finalizes webhook event processing status.
 */
export async function finalizeRazorpayWebhookEvent(
  eventId: string,
  status: 'PROCESSED' | 'FAILED' | 'UNMATCHED_ANOMALY',
  errorMessage?: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const client = getSupabaseAdminClient();
  await client.rpc('razorpay_finalize_webhook_event', {
    p_event_id: eventId,
    p_status: status,
    p_error_message: errorMessage || null,
  });
}

export interface RazorpayReconciliationResult {
  status: 'CONFIRMED_ABSENT' | 'ORDER_EXISTS' | 'CAPTURED_PAYMENT_EXISTS' | 'UNCERTAIN';
  order?: RazorpayOrder;
  capturedPayment?: RazorpayPaymentEvidence;
  error?: Error;
}

/**
 * Reconciles provider state for an order against Razorpay API to determine if cancellation is safe.
 */
export async function reconcileRazorpayOrder(
  orderNumber: string,
): Promise<RazorpayReconciliationResult> {
  try {
    const existingOrder = await activeGatewayClient.fetchOrderByReceipt(orderNumber);
    if (!existingOrder) {
      // SAFEGUARD: An empty lookup does NOT prove payment cannot succeed or order is absent.
      // Under Issue 6 requirements, inconclusive or empty lookups must preserve reservation.
      return { status: 'UNCERTAIN' };
    }

    const payments = await activeGatewayClient.fetchOrderPayments(existingOrder.id);
    const captured = payments.find((p) => p.status === 'captured');

    if (captured) {
      return {
        status: 'CAPTURED_PAYMENT_EXISTS',
        order: existingOrder,
        capturedPayment: captured,
      };
    }

    return {
      status: 'ORDER_EXISTS',
      order: existingOrder,
    };
  } catch (err: unknown) {
    return {
      status: 'UNCERTAIN',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function initiateRazorpayRefund(params: {
  paymentId: string;
  amountPaise: number;
  idempotencyKey: string;
  notes?: Record<string, string>;
}): Promise<RazorpayRefundEvidence> {
  return activeGatewayClient.createRefund(params);
}

export async function fetchRazorpayPaymentRefunds(paymentId: string): Promise<RazorpayRefundEvidence[]> {
  return activeGatewayClient.fetchPaymentRefunds(paymentId);
}

export async function finalizeOrderRefundInDatabase(input: {
  refundId: string;
  providerStatus: string;
  razorpayRefundId?: string;
  errorMessage?: string;
  webhookEventId?: string;
}): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured()) {
    throw new ServiceUnavailableError('Database is unavailable.', 'DATABASE_UNAVAILABLE');
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.rpc('storefront_finalize_order_refund', {
    p_refund_id: input.refundId,
    p_provider_status: input.providerStatus,
    p_razorpay_refund_id: input.razorpayRefundId || null,
    p_error_message: input.errorMessage || null,
    p_webhook_event_id: input.webhookEventId || null,
  });

  if (error) {
    throw new BadRequestError(
      `Refund finalization failed: ${error.message}`,
      'REFUND_FINALIZATION_FAILED',
    );
  }

  return (data || {}) as Record<string, unknown>;
}

/**
 * Evaluates whether a refund record counts against the order and payment refund ceilings.
 *
 * Fail-Closed Default-Deny Rules:
 *   - REQUESTED, PENDING, APPROVED, PROCESSED always count.
 *   - FAILED and REJECTED count UNLESS immutable, authoritative provider evidence proves non-execution.
 *   - Bare FAILED/REJECTED status, timeout, HTTP error, or missing evidence does NOT prove non-execution.
 *   - Any NULL, unknown, or future provider status counts against the ceiling.
 */
export function isRefundCountedAgainstCeiling(refund: {
  status: string | null | undefined;
  settlementEvidence?: Record<string, unknown> | null;
  settlement_evidence?: Record<string, unknown> | null;
}): boolean {
  const status = String(refund.status || '').toUpperCase().trim();
  const evidence = refund.settlementEvidence || refund.settlement_evidence;

  if (status === 'FAILED' || status === 'REJECTED') {
    const isVerifiedNonExecution = Boolean(
      evidence && (evidence.verified_non_execution === true || evidence.verifiedNonExecution === true),
    );
    return !isVerifiedNonExecution;
  }

  return true;
}

export async function fetchRazorpayOrderByReceipt(receipt: string): Promise<RazorpayOrder | null> {
  return activeGatewayClient.fetchOrderByReceipt(receipt);
}

export async function fetchRazorpayOrderPayments(orderId: string): Promise<RazorpayPaymentEvidence[]> {
  return activeGatewayClient.fetchOrderPayments(orderId);
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
