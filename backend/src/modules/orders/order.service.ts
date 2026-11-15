import crypto from 'crypto';
import mongoose from 'mongoose';
import { Order } from '../../models/Order.js';
import { Product } from '../../models/Product.js';
import { SEED_PRODUCTS } from '../../data/seedProducts.js';
import { couponService } from '../../services/coupon.service.js';
import { couponRepository } from '../../repositories/coupon.repository.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination.js';
import type { CreateOrderPayload } from '@circleup/shared';

function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// In-memory order storage for test and offline simulation mode
const IN_MEMORY_ORDERS = new Map<string, Record<string, unknown>>();

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomSuffix}`;
}

function generateGuestAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export const orderService = {
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
      const mock = IN_MEMORY_ORDERS.get(cleanNum);
      if (mock) {
        mock.guestAccessToken = null;
        mock.guestAccessTokenHash = null;
        mock.guestAccessExpiresAt = expiredDate;
        return true;
      }
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
      const mock = IN_MEMORY_ORDERS.get(cleanNum);
      if (mock) {
        mock.guestAccessToken = newHash;
        mock.guestAccessTokenHash = newHash;
        mock.guestAccessExpiresAt = newExpiresAt;
        return newRawToken;
      }
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
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

  async createOrder(payload: CreateOrderPayload) {
    const { customer, shippingAddress, items, promoCode, paymentMethod, notes, customerId } = payload;

    if (!customer?.name || !customer?.email || !customer?.phone) {
      throw new BadRequestError('Customer name, email, and phone are required.', 'MISSING_CUSTOMER_INFO');
    }

    if (!shippingAddress?.addressLine || !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.postalCode) {
      throw new BadRequestError('Complete delivery address (line, city, state, postal code) is required.', 'INCOMPLETE_ADDRESS');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('Order must contain at least one item.', 'EMPTY_ORDER_ITEMS');
    }

    if (!isDatabaseConnected()) {
      // Offline/simulation mode: resolve against seed catalog
      let subtotal = 0;
      const resolvedItems = items.map((it) => {
        const seed = SEED_PRODUCTS.find((p) => p.serialNumber.toUpperCase() === it.serialNumber.toUpperCase());
        const price = seed ? seed.price : 150000;
        const name = seed ? seed.name : `Thrift Item ${it.serialNumber}`;
        const qty = it.quantity || 1;
        subtotal += price * qty;
        return {
          serialNumber: it.serialNumber.toUpperCase(),
          name,
          price,
          quantity: qty,
          size: it.size || seed?.sizes?.[0] || 'Free Size',
          image: seed?.images?.[0] || '',
          slug: seed?.slug || '',
        };
      });

      let discount = 0;
      if (promoCode) {
        const val = await couponService.validateCoupon(promoCode, subtotal);
        if (val.valid) discount = val.discountInPaise;
      }

      const deliveryFee = subtotal - discount >= 150000 ? 0 : 9000;
      const totalAmount = Math.max(0, subtotal - discount + deliveryFee);

      const rawGuestToken = customerId ? undefined : generateGuestAccessToken();
      const guestAccessTokenHash = rawGuestToken ? hashGuestToken(rawGuestToken) : undefined;
      const guestAccessExpiresAt = customerId
        ? undefined
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const orderNumber = generateOrderNumber();
      const simulatedOrder = {
        id: orderNumber,
        orderNumber,
        customerId: customerId || undefined,
        guestAccessToken: guestAccessTokenHash,
        guestAccessTokenHash,
        guestAccessExpiresAt,
        customer,
        shippingAddress,
        items: resolvedItems,
        subtotal,
        discount,
        deliveryFee,
        totalAmount,
        status: 'CONFIRMED',
        paymentMethod: paymentMethod || 'WHATSAPP_UPI',
        paymentStatus: 'PENDING',
        promoCode: promoCode || '',
        notes: notes || '',
        createdAt: new Date().toISOString(),
      };

      IN_MEMORY_ORDERS.set(orderNumber, simulatedOrder);
      // Return raw token only in the immediate checkout response to the customer
      return {
        ...simulatedOrder,
        guestAccessToken: rawGuestToken,
      };
    }

    // Process each item against live MongoDB inventory
    const resolvedItems = [];
    let subtotal = 0;

    for (const cartItem of items) {
      const serialNumber = cartItem.serialNumber.trim().toUpperCase();
      const quantity = Math.max(1, cartItem.quantity || 1);

      const product = await Product.findOne({ serialNumber, deletedAt: null });
      if (!product) {
        throw new NotFoundError(`Product with serial number "${serialNumber}" does not exist in catalog.`, 'PRODUCT_NOT_FOUND');
      }

      if (product.stock < quantity) {
        throw new BadRequestError(
          `Insufficient stock for "${product.name}" (${serialNumber}). Requested ${quantity}, but only ${product.stock} available.`,
          'OUT_OF_STOCK',
        );
      }

      const itemPrice = product.price;
      subtotal += itemPrice * quantity;

      resolvedItems.push({
        serialNumber,
        productId: product._id,
        name: product.name,
        price: itemPrice,
        quantity,
        size: cartItem.size || (product.sizes?.[0] ?? ''),
        image: product.images?.[0] || '',
        slug: product.slug,
      });
    }

    // Apply promo discounts via couponService
    let discount = 0;
    if (promoCode) {
      const couponResult = await couponService.validateCoupon(promoCode, subtotal);
      if (couponResult.valid) {
        discount = couponResult.discountInPaise;
        await couponRepository.incrementUsage(promoCode);
      }
    }

    const deliveryFee = subtotal - discount >= 150000 ? 0 : 9000;
    const totalAmount = Math.max(0, subtotal - discount + deliveryFee);

    // Atomically decrement inventory for each item
    for (const item of resolvedItems) {
      const updated = await Product.findOneAndUpdate(
        {
          serialNumber: item.serialNumber,
          stock: { $gte: item.quantity },
        },
        {
          $inc: { stock: -item.quantity },
        },
        { new: true },
      );

      if (!updated) {
        throw new BadRequestError(`Stock conflict for item ${item.serialNumber}. Please try again.`, 'INVENTORY_RACE_CONDITION');
      }

      if (updated.stock <= 0) {
        updated.status = 'SOLD_OUT';
        await updated.save();
      }
    }

    const orderNumber = generateOrderNumber();
    const rawGuestToken = customerId ? null : generateGuestAccessToken();
    const guestAccessTokenHash = rawGuestToken ? hashGuestToken(rawGuestToken) : null;
    const guestAccessExpiresAt = customerId
      ? null
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const order = await Order.create({
      orderNumber,
      customerId: customerId || null,
      guestAccessToken: guestAccessTokenHash,
      guestAccessTokenHash,
      guestAccessExpiresAt,
      customer,
      shippingAddress,
      items: resolvedItems,
      subtotal,
      discount,
      deliveryFee,
      totalAmount,
      status: 'CONFIRMED',
      paymentMethod: paymentMethod || 'WHATSAPP_UPI',
      paymentStatus: 'PENDING',
      promoCode: promoCode || '',
      notes: notes || '',
    });

    const orderJson = order.toJSON();
    return {
      ...orderJson,
      guestAccessToken: rawGuestToken || undefined,
    };
  },

  async listCustomerOrders(customerId: string, query: { page?: unknown; limit?: unknown }) {
    const { page, limit, skip } = parsePagination(query);

    if (!isDatabaseConnected()) {
      const all = Array.from(IN_MEMORY_ORDERS.values()).filter((o) => o.customerId === customerId);
      return {
        orders: all.slice(skip, skip + limit),
        meta: buildPaginationMeta(page, limit, all.length),
      };
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
      const all = Array.from(IN_MEMORY_ORDERS.values());
      const filtered = all.filter((o) => {
        if (query.status && o.status !== query.status) return false;
        if (query.phone && (o.customer as { phone?: string } | undefined)?.phone !== query.phone) return false;
        return true;
      });
      return {
        orders: filtered.slice(skip, skip + limit),
        meta: buildPaginationMeta(page, limit, filtered.length),
      };
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
      const mock = IN_MEMORY_ORDERS.get(cleanNum);
      if (!mock) {
        throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
      }
      return mock;
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
