import mongoose from 'mongoose';
import { Order, type IOrderDocument } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { runInTransaction } from '../utils/transaction.js';
import { auditService } from './audit.service.js';
import type { AdminSessionData } from './adminAuth.service.js';
import { isSupabaseConfigured, getSupabaseAdminClient } from './supabase.service.js';
import { supabaseCatalogService } from './supabaseCatalog.service.js';
import { logger } from '../config/logger.js';

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

    // 1. Supabase Orders Query
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        let q = client
          .from('orders')
          .select('*, order_items(*)', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (query.status && query.status !== 'all') {
          q = q.eq('status', query.status.toUpperCase());
        }

        if (query.search && typeof query.search === 'string' && query.search.trim()) {
          const s = query.search.trim();
          q = q.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_email.ilike.%${s}%,customer_phone.ilike.%${s}%`);
        }

        const { data: supaOrders, error, count } = await q.range(skip, skip + limit - 1);
        if (!error && Array.isArray(supaOrders)) {
          const mapped = supaOrders.map((o: any) => ({
            id: o.id,
            orderNumber: o.order_number,
            customer: {
              name: o.customer_name || 'Customer',
              email: o.customer_email || '',
              phone: o.customer_phone || '',
            },
            shippingAddress: o.shipping_address || {},
            items: Array.isArray(o.order_items)
              ? o.order_items.map((it: any) => ({
                  productId: it.product_id,
                  serialNumber: it.serial_number,
                  name: it.name,
                  price: Number(it.price || 0),
                  quantity: Number(it.quantity || 1),
                  size: it.size,
                  color: it.color,
                  imageUrl: it.image_url,
                }))
              : [],
            totalAmount: Number(o.total_amount || 0),
            subtotal: Number(o.subtotal || o.total_amount || 0),
            discountAmount: Number(o.discount_amount || 0),
            shippingAmount: Number(o.shipping_amount || 0),
            paymentMethod: o.payment_method || 'CASH_ON_DELIVERY',
            paymentStatus: o.payment_status || 'PENDING',
            status: o.status || 'PENDING',
            trackingNumber: o.tracking_number,
            courier: o.courier,
            createdAt: o.created_at,
            updatedAt: o.updated_at,
          }));

          return {
            orders: mapped,
            meta: buildPaginationMeta(page, limit, count ?? mapped.length),
          };
        }
      } catch (err) {
        logger.warn({ err }, 'Supabase order listing fallback to MongoDB');
      }
    }

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
  ): Promise<any> {
    // 1. Supabase Status Update
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        const { data: order, error } = await client
          .from('orders')
          .select('*, order_items(*)')
          .or(`id.eq.${orderNumberOrId},order_number.eq.${orderNumberOrId.trim().toUpperCase()}`)
          .maybeSingle();

        if (order && !error) {
          const allowed = VALID_TRANSITIONS[order.status] || [];
          if (!allowed.includes(newStatus)) {
            throw new BadRequestError(
              `Invalid status transition from ${order.status} to ${newStatus}. Allowed next states: ${allowed.join(', ') || 'None (Terminal state)'}`,
              'INVALID_STATUS_TRANSITION',
            );
          }

          if (newStatus === 'CANCELLED' && Array.isArray(order.order_items)) {
            for (const item of order.order_items) {
              if (item.serial_number) {
                await supabaseCatalogService.restoreStock(item.serial_number, item.quantity || 1).catch(() => {});
              }
            }
          }

          const { data: updated, error: updateErr } = await client
            .from('orders')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', order.id)
            .select('*, order_items(*)')
            .single();

          if (!updateErr && updated) {
            if (mongoose.connection.readyState === 1) {
              await Order.findOneAndUpdate(
                { orderNumber: updated.order_number },
                { $set: { status: newStatus } },
              ).catch(() => {});
            }
            return {
              id: updated.id,
              orderNumber: updated.order_number,
              status: updated.status,
              paymentStatus: updated.payment_status,
              totalAmount: updated.total_amount,
              updatedAt: updated.updated_at,
            };
          }
        }
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
      }
    }

    if (mongoose.connection.readyState !== 1) {
      return { id: orderNumberOrId, status: newStatus };
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
          if (isSupabaseConfigured()) {
            await supabaseCatalogService.restoreStock(item.serialNumber, item.quantity || 1).catch(() => {});
          }
          if (mongoose.connection.readyState === 1) {
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
    }

    order.status = newStatus;
    await order.save();
    return order.toJSON() as unknown as IOrderDocument;
  },

  async markPaymentReceived(
    orderNumberOrId: string,
    auditActor: AdminSessionData,
    auditContext: { ipAddress?: string; userAgent?: string },
  ): Promise<any> {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        const { data: order, error } = await client
          .from('orders')
          .select('*')
          .or(`id.eq.${orderNumberOrId},order_number.eq.${orderNumberOrId.trim().toUpperCase()}`)
          .maybeSingle();

        if (order && !error) {
          if (order.payment_status === 'PAID') {
            throw new BadRequestError('Payment has already been recorded for this order.', 'PAYMENT_ALREADY_RECORDED');
          }

          const { data: updated, error: updateErr } = await client
            .from('orders')
            .update({ payment_status: 'PAID', updated_at: new Date().toISOString() })
            .eq('id', order.id)
            .select('*')
            .single();

          if (!updateErr && updated) {
            await auditService.record({
              actor: auditActor,
              action: 'ORDER_PAYMENT_VERIFIED',
              entity: 'Order',
              entityId: updated.order_number,
              diff: { previousPaymentStatus: 'PENDING', paymentStatus: 'PAID', paymentMethod: updated.payment_method },
            });

            if (mongoose.connection.readyState === 1) {
              await Order.findOneAndUpdate(
                { orderNumber: updated.order_number },
                { $set: { paymentStatus: 'PAID' } },
              ).catch(() => {});
            }

            return {
              id: updated.id,
              orderNumber: updated.order_number,
              paymentStatus: updated.payment_status,
              status: updated.status,
            };
          }
        }
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
      }
    }

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
