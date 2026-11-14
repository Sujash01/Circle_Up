import mongoose from 'mongoose';
import { Order, type IOrderDocument } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { BadRequestError, NotFoundError } from '../errors/AppError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const adminOrderService = {
  async listOrders(query: { page?: unknown; limit?: unknown; status?: string; search?: string }) {
    const { page, limit, skip } = parsePagination(query);

    if (mongoose.connection.readyState !== 1) {
      return {
        orders: [],
        meta: buildPaginationMeta(page, limit, 0),
      };
    }

    const filter: Record<string, unknown> = {};
    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { orderNumber: new RegExp(q, 'i') },
        { 'customer.name': new RegExp(q, 'i') },
        { 'customer.phone': new RegExp(q, 'i') },
        { 'customer.email': new RegExp(q, 'i') },
      ];
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

  async updateOrderStatus(
    orderNumberOrId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
  ): Promise<IOrderDocument> {
    if (mongoose.connection.readyState !== 1) {
      throw new BadRequestError('Database is offline.', 'DATABASE_OFFLINE');
    }

    const query = mongoose.isValidObjectId(orderNumberOrId)
      ? { _id: orderNumberOrId }
      : { orderNumber: orderNumberOrId.trim().toUpperCase() };

    const order = await Order.findOne(query);
    if (!order) {
      throw new NotFoundError(`Order ${orderNumberOrId} not found.`, 'ORDER_NOT_FOUND');
    }

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestError(
        `Invalid status transition from ${order.status} to ${newStatus}. Allowed next states: ${allowed.join(', ') || 'None (Terminal state)'}`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    // If transitioning to CANCELLED, restore product stock
    if (newStatus === 'CANCELLED') {
      for (const item of order.items) {
        if (item.serialNumber) {
          await Product.findOneAndUpdate(
            { serialNumber: item.serialNumber.toUpperCase() },
            {
              $inc: { stock: item.quantity || 1 },
              $set: { status: 'ACTIVE' },
            },
          );
        }
      }
    }

    order.status = newStatus;
    await order.save();
    return order.toJSON() as unknown as IOrderDocument;
  },
};
