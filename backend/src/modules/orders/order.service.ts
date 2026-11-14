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

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomSuffix}`;
}

export const orderService = {
  async createOrder(payload: CreateOrderPayload) {
    const { customer, shippingAddress, items, promoCode, paymentMethod, notes } = payload;

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

      return {
        orderNumber: generateOrderNumber(),
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
    const order = await Order.create({
      orderNumber,
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

    return order.toJSON();
  },

  async listOrders(query: { page?: unknown; limit?: unknown; status?: string; phone?: string }) {
    const { page, limit, skip } = parsePagination(query);

    if (!isDatabaseConnected()) {
      return {
        orders: [],
        meta: buildPaginationMeta(page, limit, 0),
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
    if (!isDatabaseConnected()) {
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
    }

    const order = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase() }).lean();
    if (!order) {
      throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
    }

    return {
      ...order,
      id: order._id ? String(order._id) : undefined,
    };
  },
};
