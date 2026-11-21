import crypto from 'crypto';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { Order } from '../../models/Order.js';
import { Product, type IProductDocument } from '../../models/Product.js';
import { CheckoutIdempotency } from '../../models/CheckoutIdempotency.js';
import { couponService } from '../../services/coupon.service.js';
import { couponRepository } from '../../repositories/coupon.repository.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../../errors/AppError.js';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination.js';
import type { CreateOrderPayload } from '@circleup/shared';
import { runInTransaction } from '../../utils/transaction.js';
import { ConflictError, UnprocessableEntityError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import { verifyCheckoutIndexes } from '../../utils/checkoutIndexes.js';
import { getConfiguredWhatsappNumber, settingsRepository } from '../../repositories/settings.repository.js';
import {
  isSupabaseCheckoutConfigured,
  executeStorefrontCheckoutRpc,
} from '../../services/supabase.service.js';

function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
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

function generateGuestAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function deriveGuestAccessToken(orderNumber: string): string {
  const secret = env.GUEST_ORDER_TOKEN_SECRET || env.SESSION_SECRET;
  return crypto.createHmac('sha256', secret).update(`circleup:guest-order:${orderNumber}`).digest('hex');
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
    const expiredDate = new Date(0);

    if (!isDatabaseConnected()) {
      return false;
    }

    const result = await Order.updateOne(
      { orderNumber: cleanNum },
      {
        $set: {
          guestAccessToken: null,
          guestAccessTokenHash: null,
          guestAccessExpiresAt: expiredDate,
        },
      },
    );
    return result.modifiedCount > 0;
  },

  async rotateGuestAccessToken(orderNumber: string): Promise<string> {
    const cleanNum = orderNumber.trim().toUpperCase();
    const newRawToken = generateGuestAccessToken();
    const newHash = hashGuestToken(newRawToken);
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (!isDatabaseConnected()) {
      throw new ServiceUnavailableError('Order storage is temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }

    const order = await Order.findOneAndUpdate(
      { orderNumber: cleanNum },
      {
        $set: {
          guestAccessToken: newHash,
          guestAccessTokenHash: newHash,
          guestAccessExpiresAt: newExpiresAt,
        },
      },
      { new: true },
    );

    if (!order) {
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
    }

    return newRawToken;
  },

  async createOrder(payload: CreateOrderPayload & { idempotencyKey: string }) {
    const { customer, shippingAddress, items, promoCode, paymentMethod, notes, customerId, idempotencyKey } = payload;

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

    // Explicit checkout provider selection:
    // Supabase is the canonical target architecture and default provider.
    // The legacy MongoDB checkout provider is only available in dev/test when explicitly opted into via CHECKOUT_PROVIDER=mongodb.
    // In production, Supabase is strictly mandatory and MongoDB fallback is blocked.
    const isLegacyMongoConfigured =
      env.NODE_ENV !== 'production' && env.CHECKOUT_PROVIDER === 'mongodb';

    if (isLegacyMongoConfigured) {
      return this.createOrderMongo(payload);
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

  async createOrderMongo(payload: CreateOrderPayload & { idempotencyKey: string }) {
    const { customer, shippingAddress, items, promoCode, paymentMethod, notes, customerId, idempotencyKey } = payload;

    if (!isDatabaseConnected()) {
      throw new ServiceUnavailableError('Checkout is temporarily unavailable because order storage is offline.', 'DATABASE_UNAVAILABLE');
    }

    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify({ customer, shippingAddress, items, promoCode, paymentMethod, notes, customerId })).digest('hex');

    // Fail closed unless the controlled deployment migration installed both required indexes.
    await verifyCheckoutIndexes();
    const existing = await CheckoutIdempotency.findOne({ keyHash, expiresAt: mongoose.trusted({ $gt: new Date() }) }).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ConflictError('This idempotency key was already used for a different checkout.', 'IDEMPOTENCY_KEY_REUSED');
      const priorOrder = await Order.findOne({ orderNumber: existing.orderNumber }).lean();
      if (!priorOrder) throw new ConflictError('Checkout with this key is still being resolved. Retry shortly.', 'CHECKOUT_IN_PROGRESS');
      // The record may expire while its order is being read. Do not replay it
      // beyond the idempotency window; the transaction below can replace it.
      if (existing.expiresAt.getTime() > Date.now()) {
        return { ...priorOrder, id: String(priorOrder._id), guestAccessToken: priorOrder.customerId ? undefined : deriveGuestAccessToken(priorOrder.orderNumber) };
      }
    }

    const orderNumber = generateOrderNumber();
    const rawGuestToken = customerId ? undefined : deriveGuestAccessToken(orderNumber);
    const guestAccessTokenHash = rawGuestToken ? hashGuestToken(rawGuestToken) : null;
    try {
      const created = await runInTransaction(async (session) => {
        const competing = await CheckoutIdempotency.findOne({ keyHash, expiresAt: mongoose.trusted({ $gt: new Date() }) }).session(session).lean();
        if (competing) throw new ConflictError('Checkout with this key is already being processed.', 'CHECKOUT_IN_PROGRESS');
        await CheckoutIdempotency.deleteOne({ keyHash, expiresAt: mongoose.trusted({ $lte: new Date() }) }, { session });

        const quantities = new Map<string, number>();
        for (const item of items) {
          const serial = item.serialNumber.trim().toUpperCase();
          quantities.set(serial, (quantities.get(serial) || 0) + item.quantity);
        }
        const resolvedItems = [];
        let subtotal = 0;
        const products = new Map<string, IProductDocument>();
        for (const [serialNumber, quantity] of quantities) {
          if (quantity > 10) throw new BadRequestError(`Maximum quantity per product is 10.`, 'INVALID_QUANTITY');
          const product = await Product.findOne({ serialNumber, deletedAt: null, status: mongoose.trusted({ $in: ['ACTIVE', 'PUBLISHED', 'AVAILABLE'] }) }).session(session);
          if (!product) throw new NotFoundError(`Product "${serialNumber}" is not available to order.`, 'PRODUCT_NOT_ORDERABLE');
          if (!Number.isSafeInteger(product.price) || product.price < 0) throw new UnprocessableEntityError(`Product "${serialNumber}" has an invalid stored price.`, 'INVALID_PRODUCT_PRICE');
          if (!Number.isSafeInteger(product.stock) || product.stock < quantity) throw new BadRequestError(`Insufficient stock for "${serialNumber}".`, 'OUT_OF_STOCK');
          products.set(serialNumber, product);
          subtotal += product.price * quantity;
        }
        if (!Number.isSafeInteger(subtotal)) throw new UnprocessableEntityError('Order total exceeds supported currency range.', 'INVALID_ORDER_TOTAL');

        for (const item of items) {
          const serialNumber = item.serialNumber.trim().toUpperCase();
          const product = products.get(serialNumber)!;
          resolvedItems.push({ serialNumber, productId: product._id, name: product.name, price: product.price, quantity: item.quantity, size: item.size || product.sizes?.[0] || '', image: product.images?.[0] || '', slug: product.slug });
        }

        let discount = 0;
        if (promoCode) {
          const couponResult = await couponService.validateCoupon(promoCode, subtotal, session);
          if (couponResult.valid) {
            discount = couponResult.discountInPaise;
            if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) {
              throw new UnprocessableEntityError('Coupon has an invalid stored discount.', 'INVALID_COUPON_DISCOUNT');
            }
            await couponRepository.incrementUsage(promoCode, session);
          }
        }
        const deliveryFee = subtotal - discount >= 150000 ? 0 : 9000;
        const totalAmount = subtotal - discount + deliveryFee;
        if (!Number.isSafeInteger(totalAmount)) throw new UnprocessableEntityError('Order total exceeds supported currency range.', 'INVALID_ORDER_TOTAL');
        for (const [serialNumber, quantity] of quantities) {
          const product = products.get(serialNumber)!;
          const updated = await Product.findOneAndUpdate(
            { _id: product._id, deletedAt: null, status: mongoose.trusted({ $in: ['ACTIVE', 'PUBLISHED', 'AVAILABLE'] }), stock: mongoose.trusted({ $gte: quantity }) },
            { $inc: { stock: -quantity } }, { new: true, session },
          );
          if (!updated) throw new BadRequestError(`Stock conflict for item ${serialNumber}.`, 'INVENTORY_RACE_CONDITION');
          if (updated.stock === 0) { updated.status = 'SOLD_OUT'; await updated.save({ session }); }
        }
        const [order] = await Order.create([{
          orderNumber, customerId: customerId || null, guestAccessToken: guestAccessTokenHash, guestAccessTokenHash,
          guestAccessExpiresAt: customerId ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          customer, shippingAddress, items: resolvedItems, subtotal, discount, deliveryFee, totalAmount,
          status: 'CONFIRMED', paymentMethod: paymentMethod || 'WHATSAPP_UPI', paymentStatus: 'PENDING', promoCode: promoCode || '', notes: notes || '',
        }], { session });
        await CheckoutIdempotency.create([{
          keyHash, fingerprint, orderNumber, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }], { session });
        return order;
      });
      if (!created) throw new ServiceUnavailableError('Order transaction did not commit.', 'CHECKOUT_NOT_COMMITTED');
      return { ...created.toJSON(), guestAccessToken: rawGuestToken };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/Transaction numbers are only allowed|does not support transactions|transactions are not supported/i.test(message)) {
        throw new ServiceUnavailableError('Checkout requires MongoDB replica set or sharded transaction support.', 'TRANSACTIONS_UNAVAILABLE');
      }
      if ((error as { code?: number })?.code === 11000) {
        const replayAt = new Date();
        const replay = await CheckoutIdempotency.findOne({
          keyHash,
          expiresAt: mongoose.trusted({ $gt: replayAt }),
        }).lean();
        if (replay?.fingerprint === fingerprint) {
          const priorOrder = await Order.findOne({ orderNumber: replay.orderNumber }).lean();
          if (priorOrder && replay.expiresAt.getTime() > Date.now()) {
            return { ...priorOrder, id: String(priorOrder._id), guestAccessToken: priorOrder.customerId ? undefined : deriveGuestAccessToken(priorOrder.orderNumber) };
          }
        }
      }
      throw error;
    }
  },

  async listCustomerOrders(customerId: string, query: { page?: unknown; limit?: unknown }) {
    const { page, limit, skip } = parsePagination(query);

    if (!isDatabaseConnected()) {
      throw new ServiceUnavailableError('Order storage is temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }

    const filter = { customerId };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    return {
      orders: (orders as unknown as Array<Record<string, unknown>>).map((o) => ({
        ...o,
        id: o._id ? String(o._id) : undefined,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async listOrders(query: { page?: unknown; limit?: unknown; status?: string; phone?: string }) {
    const { page, limit, skip } = parsePagination(query);

    if (!isDatabaseConnected()) {
      throw new ServiceUnavailableError('Order storage is temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }

    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.phone) {
      filter['customer.phone'] = query.phone;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    return {
      orders: (orders as unknown as Array<Record<string, unknown>>).map((o) => ({
        ...o,
        id: o._id ? String(o._id) : undefined,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getOrderByNumber(orderNumber: string) {
    const cleanNum = orderNumber.trim().toUpperCase();
    if (!isDatabaseConnected()) {
      throw new ServiceUnavailableError('Order storage is temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }

    const order = await Order.findOne({ orderNumber: cleanNum }).lean();
    if (!order) {
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
    }

    return {
      ...order,
      id: order._id ? String(order._id) : undefined,
    };
  },
};
