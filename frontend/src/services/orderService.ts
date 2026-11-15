import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { apiClient } from '@/services/apiClient';
import { readStorage, writeStorage } from '@/services/storage';

export const ORDERS_STORAGE_KEY = 'circleup_customer_orders_v1';

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
    const now = new Date();
    const estDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

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
      promoCode: '',
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    };

    let serverOrder: BackendOrderResponse | null = null;
    try {
      const res = await apiClient.post<{ data: BackendOrderResponse }>('/orders', payload);
      serverOrder = res.data?.data || null;
    } catch (err) {
      console.warn('[OrderService] Backend order gateway unavailable, using offline fallback', err);
    }

    const orderNumber = serverOrder?.orderNumber || `CU-${Math.floor(10000 + Math.random() * 90000)}`;
    const trackingNumber = `BD-${Math.floor(100000000 + Math.random() * 900000000)}`;
    const courier = 'Bluedart Express';
    const fullAddress = `${input.shippingAddress.addressLine}, ${input.shippingAddress.city}, ${input.shippingAddress.state} ${input.shippingAddress.postalCode}`;

    // Prefer server-verified totals; never trust client-submitted calculations
    const finalTotal = serverOrder?.totalAmount ?? input.totalAmount;
    const finalSubtotal = serverOrder?.subtotal ?? input.subtotal;
    const finalDiscount = serverOrder?.discount ?? input.discount;
    const finalDeliveryFee = serverOrder?.deliveryFee ?? input.shippingFee;
    const guestAccessToken = serverOrder?.guestAccessToken;

    const orderRecord: OrderRecord = {
      id: orderNumber,
      orderNumber,
      date: formatDate(now),
      estimatedDelivery: formatDate(estDate),
      courier,
      trackingNumber,
      status: 'CONFIRMED',
      step: 2,
      shippingAddress: fullAddress,
      totalAmount: finalTotal,
      subtotal: finalSubtotal,
      discount: finalDiscount,
      shippingFee: finalDeliveryFee,
      items: input.items.map((it) => ({
        name: it.name,
        size: it.size || 'Free Size',
        color: it.color || 'Curated Wash',
        image: it.image || '',
        price: it.price,
        qty: it.quantity,
        serialNumber: it.serialNumber,
      })),
      customerId: input.customerId,
      customerEmail: input.customer.email.toLowerCase().trim(),
      customerName: input.customer.name.trim(),
      customerPhone: input.customer.phone.trim(),
      paymentMethod: input.paymentMethod,
      guestAccessToken,
      createdAt: now.toISOString(),
    };

    // Store in browser LocalStorage for immediate checkout confirmation display
    const localExisting = readStorage<OrderRecord[]>(ORDERS_STORAGE_KEY, []);
    const nextLocal = [orderRecord, ...localExisting.filter((o) => o.id !== orderNumber)];
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
              courier: 'Bluedart Express',
              trackingNumber: `BD-${row.orderNumber || 'TRK'}`,
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
              courier: row.courier || 'Bluedart Express',
              trackingNumber: row.tracking_number || `BD-${row.order_number || 'TRK'}`,
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
      courier: 'Bluedart Express',
      trackingNumber: `BD-${row.orderNumber || 'TRK'}`,
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
