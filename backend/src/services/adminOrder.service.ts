import mongoose from 'mongoose';
import { Order, type IOrderDocument } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { runInTransaction } from '../utils/transaction.js';
import { auditService } from './audit.service.js';
import type { AdminSessionData } from './adminAuth.service.js';

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

  async markPaymentReceived(
    orderNumberOrId: string,
    auditActor: AdminSessionData,
    auditContext: { ipAddress?: string; userAgent?: string },
  ): Promise<IOrderDocument> {
    if (mongoose.connection.readyState !== 1) throw new ServiceUnavailableError('Order storage is temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    const query = mongoose.isValidObjectId(orderNumberOrId)
      ? { _id: orderNumberOrId }
      : { orderNumber: orderNumberOrId.trim().toUpperCase() };
    return runInTransaction(async (session) => {
      const order = await Order.findOne(query).session(session);
      if (!order) throw new NotFoundError(`Order ${orderNumberOrId} not found.`, 'ORDER_NOT_FOUND');
      if (order.paymentMethod === 'ONLINE_UPI') {
        throw new BadRequestError('Online payment cannot be manually marked received; provider verification is unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE');
      }
      if (!['CASH_ON_DELIVERY', 'WHATSAPP_UPI'].includes(order.paymentMethod)) {
        throw new BadRequestError('This payment method cannot be manually verified.', 'INVALID_MANUAL_PAYMENT_METHOD');
      }
      if (!['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
        throw new BadRequestError('Payment cannot be recorded for an order in its current state.', 'INVALID_PAYMENT_ORDER_STATE');
      }
      if (order.paymentStatus !== 'PENDING') {
        throw new BadRequestError('Payment has already been recorded for this order.', 'PAYMENT_ALREADY_RECORDED');
      }
      order.paymentStatus = 'PAID';
      await order.save({ session });
      await auditService.recordRequired({
        actor: auditActor,
        action: 'ORDER_PAYMENT_VERIFIED',
        entity: 'Order',
        entityId: order.orderNumber,
        diff: { previousPaymentStatus: 'PENDING', paymentStatus: 'PAID', paymentMethod: order.paymentMethod },
        ...auditContext,
      }, session);
      return order.toJSON() as unknown as IOrderDocument;
    });
  },
};
