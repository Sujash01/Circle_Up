import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { apiClient, ApiClientError } from '@/services/apiClient';
import { readStorage, writeStorage } from '@/services/storage';

export const ORDERS_STORAGE_KEY = 'circleup_customer_orders_v1';

export function getCheckoutPaymentLabel(paymentMethod: string, paymentStatus: 'PENDING' | 'PAID'): string {
  const methodLabel = paymentMethod === 'CASH_ON_DELIVERY'
    ? 'Cash on delivery'
    : paymentMethod === 'WHATSAPP_UPI'
      ? 'WhatsApp / UPI'
      : paymentMethod === 'ONLINE_UPI'
        ? 'Online payment'
        : 'Payment';
  return paymentStatus === 'PAID'
    ? `${methodLabel} · Payment received and verified`
    : paymentMethod === 'CASH_ON_DELIVERY'
      ? `${methodLabel} · Payment due on delivery`
      : paymentMethod === 'WHATSAPP_UPI'
        ? `${methodLabel} · Payment pending verification`
        : `${methodLabel} · Payment pending`;
}

export function getCheckoutErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
    return 'Razorpay online payment is temporarily unavailable. No payment was taken. Select Cash on Delivery or WhatsApp / UPI if that option is available.';
  }
  if (error instanceof ApiClientError && error.code === 'PAYMENT_METHOD_UNAVAILABLE') {
    return 'WhatsApp / UPI payment is unavailable because the store payment contact is not configured. Select Cash on Delivery or try again later.';
  }
  return error instanceof Error ? error.message : 'Failed to place order. Please check item availability.';
}

export interface OrderItemRecord {
  name: string;
  size: string;
  color: string;
  image: string;
  price: number;
  qty: number;
  serialNumber?: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  date: string;
  estimatedDelivery: string;
  courier: string;
  trackingNumber: string;
  status: 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  step: number;
  shippingAddress: string;
  totalAmount: number; // in paise
  subtotal: number;
  discount: number;
  shippingFee: number;
  items: OrderItemRecord[];
  customerId?: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  paymentMethod: string;
  paymentStatus: 'PENDING' | 'PAID';
  guestAccessToken?: string;
  createdAt: string;
}

export interface PurchaseRecord {
  id: string;
  title: string;
  category: string;
  condition: string;
  acquiredDate: string;
  orderId: string;
  price: number;
  image: string;
  tag: string;
}

export interface CreateOrderInput {
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
  };
  items: Array<{
    serialNumber: string;
    name: string;
    price: number;
    quantity: number;
    size?: string;
    image?: string;
    color?: string;
  }>;
  subtotal: number;
  discount: number;
  shippingFee: number;
  totalAmount: number;
  paymentMethod: string;
  promoCode?: string;
  notes?: string;
  customerId?: string;
}

interface BackendOrderResponse {
  orderNumber?: string;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  totalAmount?: number;
  guestAccessToken?: string;
  status?: 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  createdAt?: string;
  customerId?: string;
  customer?: { name?: string; email?: string; phone?: string };
  shippingAddress?: { addressLine?: string; city?: string; state?: string; postalCode?: string };
  paymentMethod?: string;
  paymentStatus?: 'PENDING' | 'PAID';
  trackingNumber?: string;
  courier?: string;
  items?: Array<{ serialNumber?: string; name?: string; price?: number; quantity?: number; size?: string; image?: string }>;
}

interface SupabaseOrderRow {
  id?: string;
  order_number?: string;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  total_amount?: number;
  subtotal?: number;
  discount_amount?: number;
  shipping_amount?: number;
  status?: 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  payment_method?: string;
  payment_status?: 'PENDING' | 'PAID';
  shipping_address?: string | { addressLine?: string; city?: string; state?: string; postalCode?: string };
  tracking_number?: string;
  courier?: string;
  created_at?: string;
  order_items?: Array<{
    name?: string;
    size?: string;
    color?: string;
    price?: number;
    quantity?: number;
    image_url?: string;
    serial_number?: string;
  }>;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export const orderService = {
  /**
   * Creates an order through the authoritative Express backend gateway.
   * Server validates inventory, unit prices, discounts, and computes official totals.
   */
  async createOrder(input: CreateOrderInput): Promise<OrderRecord> {
    // Call authoritative Express backend to place the order
    const payload = {
      customerId: input.customerId,
      customer: input.customer,
      shippingAddress: input.shippingAddress,
      items: input.items.map((it) => ({
        serialNumber: it.serialNumber,
        quantity: it.quantity,
        size: it.size,
      })),
      promoCode: input.promoCode || '',
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    };

    const fingerprint = JSON.stringify(payload);
    const storageKey = 'circleup_checkout_idempotency_v1';
    let attempt: { fingerprint: string; key: string } | undefined;
    try { attempt = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as typeof attempt; } catch { attempt = undefined; }
    if (!attempt || attempt.fingerprint !== fingerprint) {
      const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      attempt = { fingerprint, key };
      sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    }
    const res = await apiClient.post<{ data: BackendOrderResponse }>('/orders', payload, { headers: { 'Idempotency-Key': attempt.key } });
    const serverOrder = res.data?.data;
    if (
      !serverOrder?.orderNumber ||
      typeof serverOrder.subtotal !== 'number' ||
      typeof serverOrder.discount !== 'number' ||
      typeof serverOrder.deliveryFee !== 'number' ||
      typeof serverOrder.totalAmount !== 'number' ||
      !Array.isArray(serverOrder.items) ||
      serverOrder.items.length === 0
    ) {
      throw new Error('The server did not return a persisted order confirmation. Please check your orders before trying again.');
    }

    const now = serverOrder.createdAt ? new Date(serverOrder.createdAt) : new Date();
    const fullAddress = `${input.shippingAddress.addressLine}, ${input.shippingAddress.city}, ${input.shippingAddress.state} ${input.shippingAddress.postalCode}`;

    const guestAccessToken = serverOrder?.guestAccessToken;
    sessionStorage.removeItem(storageKey);

    const orderRecord: OrderRecord = {
      id: serverOrder.orderNumber,
      orderNumber: serverOrder.orderNumber,
      date: formatDate(now),
      estimatedDelivery: '',
      courier: '',
      trackingNumber: '',
      status: serverOrder.status === 'DELIVERED' ? 'DELIVERED' : serverOrder.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED',
      step: 2,
      shippingAddress: fullAddress,
      totalAmount: serverOrder.totalAmount,
      subtotal: serverOrder.subtotal,
      discount: serverOrder.discount,
      shippingFee: serverOrder.deliveryFee,
      items: serverOrder.items.map((it) => ({
        name: it.name || '',
        size: it.size || 'Free Size',
        color: 'Curated Wash',
        image: it.image || '',
        price: it.price || 0,
        qty: it.quantity || 0,
        serialNumber: it.serialNumber,
      })),
      customerId: serverOrder.customerId,
      customerEmail: serverOrder.customer?.email?.toLowerCase().trim() || input.customer.email.toLowerCase().trim(),
      customerName: serverOrder.customer?.name?.trim() || input.customer.name.trim(),
      customerPhone: serverOrder.customer?.phone?.trim() || input.customer.phone.trim(),
      paymentMethod: serverOrder.paymentMethod || input.paymentMethod,
      paymentStatus: serverOrder.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
      guestAccessToken,
      createdAt: serverOrder.createdAt || now.toISOString(),
    };

    // Persist locally only after the backend has confirmed a durable order.
    const localExisting = readStorage<OrderRecord[]>(ORDERS_STORAGE_KEY, []);
    const nextLocal = [orderRecord, ...localExisting.filter((o) => o.id !== serverOrder.orderNumber)];
    writeStorage(ORDERS_STORAGE_KEY, nextLocal);

    // Notify listening UI components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('circleup_orders_updated', { detail: orderRecord }));
    }

    return orderRecord;
  },

  /**
   * Retrieves all orders for the active customer, querying the authoritative backend
   * with fallback to LocalStorage.
   */
  async getOrders(customerId?: string, customerEmail?: string): Promise<OrderRecord[]> {
    const localOrders = readStorage<OrderRecord[]>(ORDERS_STORAGE_KEY, []);
    const cleanEmail = customerEmail?.toLowerCase().trim();

    // Filter local orders relevant to current user
    const relevantLocal = localOrders.filter((ord) => {
      if (!customerId && !cleanEmail) return true;
      if (customerId && ord.customerId === customerId) return true;
      if (cleanEmail && ord.customerEmail === cleanEmail) return true;
      return false;
    });

    // 1. Try authoritative Express backend /orders/my-orders if customer is authenticated
    if (customerId) {
      try {
        const res = await apiClient.get<{ data: BackendOrderResponse[] }>('/orders/my-orders');
        if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
          const backendOrders: OrderRecord[] = res.data.data.map((row: BackendOrderResponse) => {
            const createdAt = new Date(row.createdAt || Date.now());
            const estDate = new Date(createdAt.getTime() + 4 * 24 * 60 * 60 * 1000);
            const address = row.shippingAddress
              ? `${row.shippingAddress.addressLine || ''}, ${row.shippingAddress.city || ''}, ${row.shippingAddress.state || ''} ${row.shippingAddress.postalCode || ''}`.trim()
              : 'Delivery Address on File';

            return {
              id: row.orderNumber || '',
              orderNumber: row.orderNumber || '',
              date: formatDate(createdAt),
              estimatedDelivery: formatDate(estDate),
              courier: row.courier || '',
              trackingNumber: row.trackingNumber || '',
              status: row.status || 'CONFIRMED',
              step: row.status === 'DELIVERED' ? 4 : row.status === 'IN_TRANSIT' ? 3 : 2,
              shippingAddress: address,
              totalAmount: Number(row.totalAmount || 0),
              subtotal: Number(row.subtotal || 0),
              discount: Number(row.discount || 0),
              shippingFee: Number(row.deliveryFee || 0),
              customerId: row.customerId,
              customerEmail: row.customer?.email || '',
              customerName: row.customer?.name || '',
              customerPhone: row.customer?.phone || '',
              paymentMethod: row.paymentMethod || 'WHATSAPP_UPI',
              paymentStatus: row.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
              createdAt: row.createdAt || new Date().toISOString(),
              items: (row.items || []).map((it) => ({
                name: it.name || 'Thrift Find',
                size: it.size || 'Free Size',
                color: 'Curated Wash',
                image: it.image || '',
                price: Number(it.price || 0),
                qty: Number(it.quantity || 1),
                serialNumber: it.serialNumber,
              })),
            };
          });

          // Merge backend and local orders deduplicated by orderNumber
          const seen = new Set<string>();
          const merged: OrderRecord[] = [];
          for (const ord of backendOrders) {
            seen.add(ord.orderNumber);
            merged.push(ord);
          }
          for (const ord of relevantLocal) {
            if (!seen.has(ord.orderNumber)) {
              seen.add(ord.orderNumber);
              merged.push(ord);
            }
          }
          return merged;
        }
      } catch {
        // Fall through to Supabase / LocalStorage
      }
    }

    // 2. Strict customer_id check against Supabase if configured
    if (isSupabaseConfigured() && customerId) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            total_amount,
            subtotal,
            discount_amount,
            shipping_amount,
            status,
            payment_method,
            shipping_address,
            tracking_number,
            courier,
            created_at,
            order_items (
              name,
              size,
              color,
              price,
              quantity,
              image_url,
              serial_number
            )
          `)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const mappedRemote: OrderRecord[] = (data as unknown as SupabaseOrderRow[]).map((row) => {
            const createdAt = new Date(row.created_at || Date.now());
            const estDate = new Date(createdAt.getTime() + 4 * 24 * 60 * 60 * 1000);
            const rawItems = Array.isArray(row.order_items) ? row.order_items : [];
            const fullAddress =
              typeof row.shipping_address === 'string'
                ? row.shipping_address
                : row.shipping_address && typeof row.shipping_address === 'object'
                  ? `${row.shipping_address.addressLine || ''}, ${row.shipping_address.city || ''}, ${row.shipping_address.state || ''} ${row.shipping_address.postalCode || ''}`.trim()
                  : 'Delivery Address on File';

            return {
              id: row.order_number || row.id || '',
              orderNumber: row.order_number || row.id || '',
              date: formatDate(createdAt),
              estimatedDelivery: formatDate(estDate),
              courier: row.courier || '',
              trackingNumber: row.tracking_number || '',
              status: row.status || 'CONFIRMED',
              step: row.status === 'DELIVERED' ? 4 : row.status === 'IN_TRANSIT' ? 3 : 2,
              shippingAddress: fullAddress,
              totalAmount: Number(row.total_amount || 0),
              subtotal: Number(row.subtotal || 0),
              discount: Number(row.discount_amount || 0),
              shippingFee: Number(row.shipping_amount || 0),
              customerId: row.customer_id,
              customerEmail: row.customer_email || '',
              customerName: row.customer_name || '',
              customerPhone: row.customer_phone || '',
              paymentMethod: row.payment_method || 'COD',
              paymentStatus: row.payment_status === 'PAID' ? 'PAID' : 'PENDING',
              createdAt: row.created_at || new Date().toISOString(),
              items: rawItems.map((it) => ({
                name: it.name || 'Thrift Find',
                size: it.size || 'Free Size',
                color: it.color || 'Curated Wash',
                image: it.image_url || '',
                price: Number(it.price || 0),
                qty: Number(it.quantity || 1),
                serialNumber: it.serial_number,
              })),
            };
          });

          const seenIds = new Set<string>();
          const combined: OrderRecord[] = [];
          for (const ord of mappedRemote) {
            if (!seenIds.has(ord.id)) {
              seenIds.add(ord.id);
              combined.push(ord);
            }
          }
          for (const ord of relevantLocal) {
            if (!seenIds.has(ord.id)) {
              seenIds.add(ord.id);
              combined.push(ord);
            }
          }
          return combined;
        }
      } catch (err) {
        console.warn('[OrderService] Supabase query notice:', err);
      }
    }

    return relevantLocal;
  },

  /**
   * Derives acquired wardrobe pieces from confirmed/delivered orders.
   */
  getPurchases(orders: OrderRecord[]): PurchaseRecord[] {
    const list: PurchaseRecord[] = [];
    orders.forEach((ord) => {
      ord.items.forEach((item, idx) => {
        list.push({
          id: `pur-${ord.id}-${idx}`,
          title: item.name,
          category: 'Curated Archival',
          condition: 'Authentic Verified Find',
          acquiredDate: ord.date,
          orderId: ord.id,
          price: item.price,
          image: item.image,
          tag: item.size || 'Archival Find',
        });
      });
    });
    return list;
  },

  /**
   * Tracks an order using secure header authentication (for guest or customer).
   * Never passes guest tokens in URL query strings.
   */
  async trackOrderByNumber(orderNumber: string, guestToken?: string): Promise<OrderRecord> {
    const headers: Record<string, string> = {};
    if (guestToken) {
      headers['x-guest-order-token'] = guestToken;
    }
    const res = await apiClient.get<{ data: BackendOrderResponse }>(`/orders/${orderNumber}`, { headers });
    const row = res.data.data;
    const createdAt = new Date(row.createdAt || Date.now());
    const estDate = new Date(createdAt.getTime() + 4 * 24 * 60 * 60 * 1000);
    const address = row.shippingAddress
      ? `${row.shippingAddress.addressLine || ''}, ${row.shippingAddress.city || ''}, ${row.shippingAddress.state || ''} ${row.shippingAddress.postalCode || ''}`.trim()
      : 'Delivery Address on File';

    return {
      id: row.orderNumber || '',
      orderNumber: row.orderNumber || '',
      date: formatDate(createdAt),
      estimatedDelivery: formatDate(estDate),
      courier: row.courier || '',
      trackingNumber: row.trackingNumber || '',
      status: row.status || 'CONFIRMED',
      step: row.status === 'DELIVERED' ? 4 : row.status === 'IN_TRANSIT' ? 3 : 2,
      shippingAddress: address,
      totalAmount: Number(row.totalAmount || 0),
      subtotal: Number(row.subtotal || 0),
      discount: Number(row.discount || 0),
      shippingFee: Number(row.deliveryFee || 0),
      customerId: row.customerId,
      customerEmail: row.customer?.email || '',
      customerName: row.customer?.name || '',
      customerPhone: row.customer?.phone || '',
      paymentMethod: row.paymentMethod || 'WHATSAPP_UPI',
      paymentStatus: row.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
      guestAccessToken: guestToken,
      createdAt: row.createdAt || new Date().toISOString(),
      items: (row.items || []).map((it) => ({
        name: it.name || 'Thrift Find',
        size: it.size || 'Free Size',
        color: 'Curated Wash',
        image: it.image || '',
        price: Number(it.price || 0),
        qty: Number(it.quantity || 1),
        serialNumber: it.serialNumber,
      })),
    };
  },
};
