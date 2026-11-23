import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import type { AdminSessionData } from './adminAuth.service.js';
import { emailService } from './email.service.js';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '@circleup/shared';

type OrderRow = Record<string, unknown>;

function unavailable(message = 'Order storage is temporarily unavailable.'): ServiceUnavailableError {
  return new ServiceUnavailableError(message, 'DATABASE_UNAVAILABLE');
}

function normalizeOrderRef(value: string): string {
  const reference = value.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference);
  const isOrderNumber = /^ORD-[A-Z0-9-]{8,80}$/i.test(reference);
  if (!isUuid && !isOrderNumber) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
  return isUuid ? reference : reference.toUpperCase();
}

function mapOrder(row: OrderRow) {
  const rawItems = Array.isArray(row.order_items) ? row.order_items as OrderRow[] : [];
  return {
    id: String(row.id || ''),
    orderNumber: String(row.order_number || ''),
    customerId: row.customer_id || null,
    customer: {
      name: row.customer_name || 'Customer',
      email: row.customer_email || '',
      phone: row.customer_phone || '',
    },
    shippingAddress: row.shipping_address || {},
    items: rawItems.map((item) => ({
      productId: item.product_id || undefined,
      serialNumber: item.serial_number || '',
      name: item.name || '',
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      size: item.size || '',
      color: item.color || '',
      image: item.image_url || '',
    })),
    totalAmount: Number(row.total_amount || 0),
    subtotal: Number(row.subtotal || row.total_amount || 0),
    discount: Number(row.discount_amount || 0),
    deliveryFee: Number(row.shipping_amount || 0),
    paymentMethod: row.payment_method || 'CASH_ON_DELIVERY',
    paymentStatus: row.payment_status || 'PENDING',
    status: row.status || 'PENDING',
    trackingNumber: row.tracking_number || '',
    courier: row.courier || '',
    promoCode: row.promo_code || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function raiseRpcError(error: { message?: string; code?: string }): never {
  let payload: { code?: string; message?: string } = {};
  try {
    const start = error.message?.indexOf('{') ?? -1;
    const end = error.message?.lastIndexOf('}') ?? -1;
    if (start >= 0 && end > start) payload = JSON.parse(error.message!.slice(start, end + 1)) as typeof payload;
  } catch { /* use the generic storage error below */ }

  const code = payload.code || 'DATABASE_UNAVAILABLE';
  const message = payload.message || 'Order operation could not be completed.';
  if (code === 'FORBIDDEN') throw new ForbiddenError(message, code);
  if (code === 'ORDER_NOT_FOUND') throw new NotFoundError(message, code);
  if (code === 'VALIDATION_ERROR' || code === 'INVALID_STATUS_TRANSITION' || code === 'PAYMENT_ALREADY_RECORDED' || code === 'PAYMENT_PROVIDER_UNAVAILABLE' || code === 'INVALID_PAYMENT_ORDER_STATE' || code === 'INVALID_MANUAL_PAYMENT_METHOD') {
    throw new BadRequestError(message, code);
  }
  if (code === 'ORDER_CONFLICT') throw new ConflictError(message, code);
  throw unavailable(message);
}

async function callOrderRpc(name: string, params: Record<string, unknown>): Promise<OrderRow> {
  if (!isSupabaseConfigured()) throw unavailable('Supabase order storage is not configured.');
  let result;
  try {
    result = await getSupabaseAdminClient().rpc(name, params);
  } catch {
    throw unavailable();
  }
  if (result.error) raiseRpcError(result.error);
  const data = result.data as OrderRow | null;
  if (!data || typeof data !== 'object') throw unavailable('Supabase did not confirm the order operation.');
  return data;
}

function auditArgs(actor: AdminSessionData, context: { ipAddress?: string; userAgent?: string }) {
  return {
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_actor_role: actor.role,
    p_ip_address: context.ipAddress || '127.0.0.1',
    p_user_agent: (context.userAgent || 'CircleUp Admin').slice(0, 1024),
  };
}

export const adminOrderService = {
  async listOrders(query: { page?: unknown; limit?: unknown; status?: string; search?: string }) {
    const { page, limit, skip } = parsePagination(query);
    if (!isSupabaseConfigured()) throw unavailable('Supabase order storage is not configured.');
    const client = getSupabaseAdminClient();
    let request = client.from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (query.status && query.status.toLowerCase() !== 'all') request = request.eq('status', query.status.toUpperCase());
    const search = query.search?.trim().replace(/[\\%_.,()]/g, ' ');
    if (search) request = request.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%`);

    let result;
    try {
      result = await request.range(skip, skip + limit - 1);
    } catch {
      throw unavailable('Failed to retrieve admin orders from Supabase.');
    }
    if (result.error) throw unavailable('Failed to retrieve admin orders from Supabase.');
    const rows = Array.isArray(result.data) ? result.data as OrderRow[] : [];
    const total = typeof result.count === 'number' ? result.count : rows.length;
    return { orders: rows.map(mapOrder), meta: buildPaginationMeta(page, limit, total) };
  },

  async updateOrderStatus(
    orderRef: string,
    newStatus: OrderStatus,
    actor: AdminSessionData,
    auditContext: { ipAddress?: string; userAgent?: string },
  ) {
    if (!ORDER_STATUS_TRANSITIONS[newStatus] && newStatus !== 'PENDING') {
      throw new BadRequestError('Order status is invalid.', 'VALIDATION_ERROR');
    }
    const result = await callOrderRpc('admin_update_order_status', {
      p_order_ref: normalizeOrderRef(orderRef),
      p_new_status: newStatus,
      ...auditArgs(actor, auditContext),
    });
    const order = result.order as OrderRow | undefined;
    if (!order) throw unavailable('Supabase did not return the updated order.');
    const mapped = mapOrder({ ...order, order_items: result.order_items });
    if (newStatus === 'SHIPPED') {
      const cust = mapped.customer as unknown as { email?: string; name?: string };
      void emailService.sendShippingUpdate({
        orderNumber: mapped.orderNumber,
        customerEmail: cust?.email,
        customerName: cust?.name,
      }).catch(() => { });
    }
    return mapped;
  },

  async markPaymentReceived(
    orderRef: string,
    actor: AdminSessionData,
    auditContext: { ipAddress?: string; userAgent?: string },
    options?: { utrNumber?: string; paymentProofUrl?: string },
  ) {
    const result = await callOrderRpc('admin_mark_order_payment_received', {
      p_order_ref: normalizeOrderRef(orderRef),
      p_utr_number: options?.utrNumber || null,
      p_payment_proof_url: options?.paymentProofUrl || null,
      ...auditArgs(actor, auditContext),
    });
    const order = result.order as OrderRow | undefined;
    if (!order) throw unavailable('Supabase did not return the payment update.');
    return mapOrder({ ...order, order_items: result.order_items });
  },

  async processRefund(
    orderRef: string,
    amountPaise: number,
    reason: string,
    routingAction: 'RESTOCK' | 'DRY_CLEAN' | 'ALTERATION' | 'DISCARD',
    actor: AdminSessionData,
    auditContext: { ipAddress?: string; userAgent?: string },
  ) {
    const result = await callOrderRpc('admin_process_order_refund', {
      p_order_ref: normalizeOrderRef(orderRef),
      p_amount_paise: amountPaise,
      p_reason: reason,
      p_routing_action: routingAction,
      ...auditArgs(actor, auditContext),
    });
    const order = result.order as OrderRow | undefined;
    if (!order) throw unavailable('Supabase did not return the refund result.');
    const mapped = mapOrder({ ...order, order_items: result.order_items });

    const cust = mapped.customer as unknown as { email?: string; name?: string };
    void emailService.sendRefundConfirmation(
      {
        orderNumber: mapped.orderNumber,
        customerEmail: cust?.email,
        customerName: cust?.name,
      },
      amountPaise,
      reason
    ).catch(() => { });

    return { order: mapped, refund: result.refund };
  },

  async createFulfillment(
    orderRef: string,
    trackingNumber: string,
    carrier: string,
    notes: string | undefined,
    actor: AdminSessionData,
    auditContext: { ipAddress?: string; userAgent?: string },
  ) {
    const result = await callOrderRpc('admin_create_order_fulfillment', {
      p_order_ref: normalizeOrderRef(orderRef),
      p_tracking_number: trackingNumber,
      p_carrier: carrier,
      p_notes: notes || null,
      ...auditArgs(actor, auditContext),
    });
    const order = result.order as OrderRow | undefined;
    if (!order) throw unavailable('Supabase did not return the fulfillment result.');
    const mapped = mapOrder({ ...order, order_items: result.order_items });

    const cust = mapped.customer as unknown as { email?: string; name?: string };
    void emailService.sendShippingUpdate(
      {
        orderNumber: mapped.orderNumber,
        customerEmail: cust?.email,
        customerName: cust?.name,
      },
      trackingNumber,
      carrier
    ).catch(() => { });

    return { order: mapped, fulfillment: result.fulfillment };
  },

  async getDailyReconciliation(days = 30) {
    if (!isSupabaseConfigured()) throw unavailable('Supabase order storage is not configured.');
    let result;
    try {
      result = await getSupabaseAdminClient().rpc('admin_get_daily_reconciliation', { p_days: days });
    } catch {
      throw unavailable('Failed to retrieve reconciliation data from Supabase.');
    }
    if (result.error) throw unavailable(`Failed to retrieve reconciliation data: ${result.error.message}`);
    return result.data || [];
  },
};
