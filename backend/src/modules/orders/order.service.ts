import crypto from 'crypto';
import { createHash } from 'crypto';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../../errors/AppError.js';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination.js';
import type { CreateOrderPayload } from '@circleup/shared';
import { env } from '../../config/env.js';
import { getConfiguredWhatsappNumber, settingsRepository } from '../../repositories/settings.repository.js';
import {
  isSupabaseCheckoutConfigured,
  executeStorefrontCheckoutRpc,
  getSupabaseAdminClient,
} from '../../services/supabase.service.js';

type SupabaseOrderRow = Record<string, any>;

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

function deriveGuestAccessToken(orderNumber: string): string {
  const secret = env.GUEST_ORDER_TOKEN_SECRET || env.SESSION_SECRET;
  return crypto.createHmac('sha256', secret).update(`circleup:guest-order:${orderNumber}`).digest('hex');
}

function generateGuestAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export const orderService = {
  generateOrderNumber,
  verifyGuestAccessToken(
    providedToken: string,
    storedTokenOrHash?: string | null,
    expiresAt?: Date | null,
  ): boolean {
    if (!providedToken || !storedTokenOrHash) return false;
    if (expiresAt && new Date() > new Date(expiresAt)) return false;
    try {
      const cleanProvided = providedToken.trim();
      const providedHash = hashGuestToken(cleanProvided);
      const bufStored = Buffer.from(storedTokenOrHash.trim());

      // 1. Primary path: stored value is SHA-256 hash of provided token
      const bufProvidedHash = Buffer.from(providedHash);
      if (
        bufProvidedHash.length === bufStored.length &&
        crypto.timingSafeEqual(bufProvidedHash, bufStored)
      ) {
        return true;
      }

      // 2. Backward compatibility path: legacy orders that stored raw token directly
      const bufProvidedRaw = Buffer.from(cleanProvided);
      if (
        bufProvidedRaw.length === bufStored.length &&
        crypto.timingSafeEqual(bufProvidedRaw, bufStored)
      ) {
        return true;
      }

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
    const newRawToken = generateGuestAccessToken();
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
    const rawGuestToken = customerId ? undefined : deriveGuestAccessToken(orderNumber);
    const guestAccessTokenHash = rawGuestToken ? hashGuestToken(rawGuestToken) : null;
    const guestAccessExpiresAt = customerId
      ? null
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Authoritative Supabase atomic RPC execution path
    // Zero catch-and-fallback to MongoDB: all RPC errors or database failures throw directly
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
    const ephemeralGuestToken = rpcResult.customerId
      ? undefined
      : deriveGuestAccessToken(rpcResult.orderNumber);

    return {
      ...rpcResult,
      guestAccessToken: ephemeralGuestToken,
    };
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
};
