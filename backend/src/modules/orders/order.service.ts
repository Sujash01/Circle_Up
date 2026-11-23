import crypto from 'crypto';
import { createHash } from 'crypto';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../../errors/AppError.js';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination.js';
import type { CreateOrderPayload } from '@circleup/shared';
import { env } from '../../config/env.js';
import { emailService } from '../../services/email.service.js';
import { getConfiguredWhatsappNumber, settingsRepository } from '../../repositories/settings.repository.js';
import {
  isSupabaseCheckoutConfigured,
  isSupabaseConfigured,
  executeStorefrontCheckoutRpc,
  getSupabaseAdminClient,
} from '../../services/supabase.service.js';

type SupabaseOrderRow = Record<string, unknown>;

function mapSupabaseOrder(row: SupabaseOrderRow): Record<string, unknown> {
  const address = row.shipping_address && typeof row.shipping_address === 'object'
    ? row.shipping_address as Record<string, unknown>
    : {};
  const items = Array.isArray(row.order_items) ? row.order_items : Array.isArray(row.items) ? row.items : [];
  const guestHash = row.guest_access_token_hash || null;
  return {
    id: String(row.id),
    orderNumber: String(row.order_number || ''),
    customerId: row.customer_id || null,
    guestAccessTokenHash: guestHash,
    guestAccessToken: guestHash,
    guestAccessExpiresAt: row.guest_access_expires_at || null,
    customer: {
      name: String(row.customer_name || ''),
      email: String(row.customer_email || ''),
      phone: String(row.customer_phone || ''),
    },
    shippingAddress: address,
    items: items.map((item: SupabaseOrderRow) => ({
      productId: item.product_id ? String(item.product_id) : undefined,
      serialNumber: String(item.serial_number || ''),
      name: String(item.name || ''),
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      size: item.size || '',
      color: item.color || '',
      image: item.image_url || '',
      slug: item.slug || '',
    })),
    subtotal: Number(row.subtotal || 0),
    discount: Number(row.discount_amount || 0),
    deliveryFee: Number(row.shipping_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    trackingNumber: row.tracking_number || '',
    courier: row.courier || '',
    promoCode: row.promo_code || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwOrderStorageError(message: string): never {
  throw new ServiceUnavailableError(message, 'DATABASE_UNAVAILABLE');
}

export function getKolkataDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value ?? '00';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${year}${month}${day}`;
}

export function generateOrderNumber(date: Date = new Date()): string {
  const dateStr = getKolkataDateString(date);
  // Complete unhyphenated UUID v4 (32 hex characters) providing 122 bits of cryptographic entropy
  const cryptoSuffix = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return `ORD-${dateStr}-${cryptoSuffix}`;
}

const ephemeralGuestTokens = new Map<string, { token: string; createdAt: number }>();

function cacheEphemeralGuestToken(keyHash: string, token: string) {
  const now = Date.now();
  if (ephemeralGuestTokens.size > 1000) {
    for (const [key, val] of ephemeralGuestTokens.entries()) {
      if (now - val.createdAt > 24 * 60 * 60 * 1000) {
        ephemeralGuestTokens.delete(key);
      }
    }
  }
  ephemeralGuestTokens.set(keyHash, { token, createdAt: now });
}

function getGuestTokenSecret(): string {
  const secret = env.GUEST_ORDER_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    if (env.NODE_ENV === 'test') {
      return 'circleup-test-guest-token-secret-at-least-32';
    }
    throw new Error('GUEST_ORDER_TOKEN_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

export function issueGuestAccessToken(orderNumber?: string): string {
  const secret = getGuestTokenSecret();
  // 32 cryptographically secure random bytes (256 bits of entropy)
  const randomEntropy = crypto.randomBytes(32).toString('hex');
  const payload = orderNumber ? `${orderNumber.trim().toUpperCase()}:${randomEntropy}` : randomEntropy;
  const signature = crypto.createHmac('sha256', secret).update(`circleup:guest-token:${payload}`).digest('hex');
  return `${payload}.${signature}`;
}

export function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export const orderService = {
  generateOrderNumber,
  issueGuestAccessToken,
  verifyGuestAccessToken(
    providedToken: string,
    storedTokenOrHash?: string | null,
    expiresAt?: Date | null,
    orderNumber?: string | null,
  ): boolean {
    if (!providedToken || !storedTokenOrHash) return false;
    if (expiresAt && new Date() > new Date(expiresAt)) return false;
    try {
      const cleanProvided = providedToken.trim();
      const cleanStored = storedTokenOrHash.trim();

      // 1. Verify cryptographic HMAC signature if token format is payload.signature
      const dotIndex = cleanProvided.lastIndexOf('.');
      if (dotIndex > 0) {
        const payload = cleanProvided.substring(0, dotIndex);
        const signature = cleanProvided.substring(dotIndex + 1);
        const secret = getGuestTokenSecret();
        const expectedSig = crypto
          .createHmac('sha256', secret)
          .update(`circleup:guest-token:${payload}`)
          .digest('hex');

        const bufSig = Buffer.from(signature);
        const bufExpected = Buffer.from(expectedSig);
        if (bufSig.length !== bufExpected.length || !crypto.timingSafeEqual(bufSig, bufExpected)) {
          return false;
        }

        // If orderNumber is specified, ensure the payload matches the target order
        if (orderNumber && payload.includes(':')) {
          const [tokenOrderNumber] = payload.split(':');
          if (tokenOrderNumber !== orderNumber.trim().toUpperCase()) {
            return false;
          }
        }
      }

      // 2. Authoritative check: stored value MUST match the SHA-256 hash of the provided token
      const providedHash = hashGuestToken(cleanProvided);
      const bufProvidedHash = Buffer.from(providedHash);
      const bufStored = Buffer.from(cleanStored);

      if (
        bufProvidedHash.length === bufStored.length &&
        crypto.timingSafeEqual(bufProvidedHash, bufStored)
      ) {
        return true;
      }

      // 3. Stored hash is NEVER accepted as a direct token (legacy direct match branch removed)
      return false;
    } catch {
      return false;
    }
  },

  async revokeGuestAccessToken(orderNumber: string): Promise<boolean> {
    const cleanNum = orderNumber.trim().toUpperCase();
    const { data, error } = await getSupabaseAdminClient()
      .from('orders')
      .update({ guest_access_token_hash: null, guest_access_expires_at: new Date(0).toISOString() })
      .eq('order_number', cleanNum)
      .select('id')
      .maybeSingle();
    if (error) throwOrderStorageError(`Failed to revoke guest order access: ${error.message}`);
    return Boolean(data);
  },

  async rotateGuestAccessToken(orderNumber: string): Promise<string> {
    const cleanNum = orderNumber.trim().toUpperCase();
    const newRawToken = issueGuestAccessToken(cleanNum);
    const newHash = hashGuestToken(newRawToken);
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const { data, error } = await getSupabaseAdminClient()
      .from('orders')
      .update({ guest_access_token_hash: newHash, guest_access_expires_at: newExpiresAt.toISOString() })
      .eq('order_number', cleanNum)
      .select('id')
      .maybeSingle();
    if (error) throwOrderStorageError(`Failed to rotate guest order access: ${error.message}`);
    if (!data) {
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
    }

    return newRawToken;
  },

  async createOrder(payload: CreateOrderPayload & { idempotencyKey: string }) {
    const { customer, shippingAddress, items, paymentMethod } = payload;

    // No Razorpay initiation or verification flow is configured in this application yet.
    // Reject online payment before any order, coupon, or inventory mutation can occur.
    if (paymentMethod === 'ONLINE_UPI') {
      throw new ServiceUnavailableError(
        'Online payment is temporarily unavailable. Please try again later.',
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
    }

    if (paymentMethod === 'WHATSAPP_UPI') {
      const settings = await settingsRepository.getSettings();
      if (!settings.isWhatsappVerified || !getConfiguredWhatsappNumber(settings.whatsappNumber)) {
        throw new ServiceUnavailableError(
          'WhatsApp / UPI payment is temporarily unavailable because store contact details have not been verified.',
          'PAYMENT_METHOD_UNAVAILABLE',
        );
      }
    }

    // COD Contact Verification Gate (Resolves P0-7):
    // Require a verifiable, non-dummy phone number and valid email to prevent stock denial-of-service
    if (paymentMethod === 'CASH_ON_DELIVERY') {
      const rawPhone = customer?.phone ? String(customer.phone).trim() : '';
      const phoneDigits = rawPhone.replace(/[^0-9]/g, '');
      const isDummyPhone =
        phoneDigits.length < 10 ||
        /^0+$/.test(phoneDigits) ||
        /^1234567890$/.test(phoneDigits) ||
        /^(\d)\1{9,}$/.test(phoneDigits);
      const isEmailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(customer?.email?.trim() || '');

      if (!rawPhone || isDummyPhone || !isEmailValid) {
        throw new BadRequestError(
          'A verifiable phone number and contact email are required to reserve inventory for Cash on Delivery orders.',
          'COD_VERIFICATION_REQUIRED',
        );
      }
    }

    if (!customer?.name || !customer?.email || !customer?.phone) {
      throw new BadRequestError('Customer name, email, and phone are required.', 'MISSING_CUSTOMER_INFO');
    }

    if (!shippingAddress?.addressLine || !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.postalCode) {
      throw new BadRequestError('Complete delivery address (line, city, state, postal code) is required.', 'INCOMPLETE_ADDRESS');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('Order must contain at least one item.', 'EMPTY_ORDER_ITEMS');
    }

    return this.createOrderSupabase(payload);
  },

  async createOrderSupabase(payload: CreateOrderPayload & { idempotencyKey: string }) {
    const { customer, shippingAddress, items, promoCode, paymentMethod, notes, customerId, idempotencyKey } = payload;

    // 1. Fail closed if monetary gate is unverified in production
    if (env.NODE_ENV === 'production' && !env.MONETARY_RECONCILIATION_VERIFIED) {
      throw new ServiceUnavailableError(
        'Storefront checkout via Supabase is blocked in production: product catalog monetary units (paise vs rupees) have not been verified. Set MONETARY_RECONCILIATION_VERIFIED=true only after verifying database prices.',
        'MONETARY_RECONCILIATION_REQUIRED',
      );
    }

    // 2. Fail closed if privileged Supabase credentials are missing or unconfigured
    if (!isSupabaseCheckoutConfigured()) {
      throw new ServiceUnavailableError(
        'Privileged Supabase server configuration is missing. SUPABASE_SERVICE_ROLE_KEY is required for storefront checkout.',
        'DATABASE_UNAVAILABLE',
      );
    }

    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify({ customer, shippingAddress, items, promoCode, paymentMethod, notes, customerId })).digest('hex');

    const orderNumber = generateOrderNumber();
    let rawGuestToken: string | undefined;
    if (!customerId) {
      const cached = ephemeralGuestTokens.get(keyHash);
      if (cached) {
        rawGuestToken = cached.token;
      } else {
        rawGuestToken = issueGuestAccessToken(orderNumber);
        cacheEphemeralGuestToken(keyHash, rawGuestToken);
      }
    }
    const guestAccessTokenHash = rawGuestToken ? hashGuestToken(rawGuestToken) : null;
    const guestAccessExpiresAt = customerId
      ? null
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Authoritative Supabase atomic RPC execution path
    // Zero catch-and-fallback to legacy databases: all RPC errors or database failures throw directly
    const rpcResult = await executeStorefrontCheckoutRpc({
      p_key_hash: keyHash,
      p_fingerprint: fingerprint,
      p_customer_id: customerId || null,
      p_customer: {
        name: customer.name.trim(),
        email: customer.email.trim().toLowerCase(),
        phone: customer.phone.trim(),
      },
      p_shipping_address: shippingAddress,
      p_items: items.map((it) => ({
        serialNumber: it.serialNumber.trim().toUpperCase(),
        quantity: it.quantity,
        size: it.size,
      })),
      p_payment_method: paymentMethod || 'WHATSAPP_UPI',
      p_promo_code: promoCode ? promoCode.trim().toUpperCase() : null,
      p_notes: notes ? notes.trim() : null,
      p_guest_access_token_hash: guestAccessTokenHash,
      p_guest_access_expires_at: guestAccessExpiresAt,
      p_order_number: orderNumber,
    });

    // Ephemeral guest token attached strictly in memory (never stored in response_payload or DB)
    const finalResponse = {
      ...rpcResult,
      guestAccessToken: rpcResult.customerId ? undefined : (ephemeralGuestTokens.get(keyHash)?.token || rawGuestToken),
    };

    // Trigger transactional order confirmation and owner alert (non-blocking)
    void emailService.sendOrderConfirmation(
      {
        orderNumber: rpcResult.orderNumber,
        customerEmail: customer.email,
        customerName: customer.name,
        totalInPaise: rpcResult.totalAmount,
        subtotalInPaise: rpcResult.subtotal,
        deliveryFeeInPaise: rpcResult.deliveryFee,
        discountInPaise: rpcResult.discount,
        shippingAddress,
      },
      (rpcResult.items || []).map((it) => ({
        title: it.name || 'Vintage Find',
        size: it.size,
        priceInPaise: it.price || 0,
        quantity: it.quantity || 1,
      }))
    ).catch(() => { });

    void emailService.sendOwnerOrderAlert(
      {
        orderNumber: rpcResult.orderNumber,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        paymentMethod: paymentMethod || 'WHATSAPP_UPI',
        totalInPaise: rpcResult.totalAmount,
      },
      (rpcResult.items || []).map((it) => ({
        title: it.name || 'Vintage Find',
        quantity: it.quantity || 1,
      }))
    ).catch(() => { });

    return finalResponse;
  },

  async listCustomerOrders(customerId: string, query: { page?: unknown; limit?: unknown }) {
    const { page, limit, skip } = parsePagination(query);
    let result;
    try {
      result = await getSupabaseAdminClient()
        .from('orders')
        .select('*, order_items(*)', { count: 'exact' })
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .range(skip, skip + limit - 1);
    } catch {
      throwOrderStorageError('Failed to retrieve customer orders from Supabase.');
    }
    const { data, error, count } = result;
    if (error) throwOrderStorageError(`Failed to retrieve customer orders: ${error.message}`);
    const orders = (data || []).map((row: SupabaseOrderRow) => mapSupabaseOrder(row));
    const total = typeof count === 'number' ? count : orders.length;

    return {
      orders,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async listOrders(query: { page?: unknown; limit?: unknown; status?: string; phone?: string }) {
    const { page, limit, skip } = parsePagination(query);
    let request = getSupabaseAdminClient().from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (query.status && query.status.toLowerCase() !== 'all') request = request.eq('status', query.status.toUpperCase());
    if (query.phone?.trim()) request = request.eq('customer_phone', query.phone.trim());
    let result;
    try {
      result = await request.range(skip, skip + limit - 1);
    } catch {
      throwOrderStorageError('Failed to retrieve orders from Supabase.');
    }
    const { data, error, count } = result;
    if (error) throwOrderStorageError(`Failed to retrieve orders: ${error.message}`);
    const orders = (data || []).map((row: SupabaseOrderRow) => mapSupabaseOrder(row));
    const total = typeof count === 'number' ? count : orders.length;
    return {
      orders,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getOrderByNumber(orderNumber: string) {
    const cleanNum = orderNumber.trim().toUpperCase();
    let result;
    try {
      result = await getSupabaseAdminClient()
        .from('orders')
        .select('*, order_items(*)')
        .eq('order_number', cleanNum)
        .maybeSingle();
    } catch {
      throwOrderStorageError(`Failed to retrieve order ${cleanNum} from Supabase.`);
    }
    const { data, error } = result;
    if (error) throwOrderStorageError(`Failed to retrieve order ${cleanNum}: ${error.message}`);
    const order = data ? mapSupabaseOrder(data as SupabaseOrderRow) : null;
    if (!order) {
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
    }
    return order;
  },

  async expireStaleReservations(expiryHours: number = env.RESERVATION_EXPIRY_HOURS) {
    if (isSupabaseConfigured()) {
      const client = getSupabaseAdminClient();
      const { data, error } = await client.rpc('admin_release_expired_reservations', {
        p_expiry_hours: expiryHours,
      });
      if (error) {
        throw new ServiceUnavailableError(
          `Failed to release expired reservations: ${error.message}`,
          'DATABASE_UNAVAILABLE',
        );
      }
      return data as {
        expiredOrdersCount: number;
        restoredItemsCount: number;
        expiryHours: number;
      };
    }

    return {
      expiredOrdersCount: 0,
      restoredItemsCount: 0,
      expiryHours,
    };
  },
};
