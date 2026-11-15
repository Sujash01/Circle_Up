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

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export const orderService = {
  /**
   * Creates and persists a customer order across Supabase and LocalStorage.
   */
  async createOrder(input: CreateOrderInput): Promise<OrderRecord> {
    const now = new Date();
    const estDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const orderId = `CU-${Math.floor(10000 + Math.random() * 90000)}`;
    const trackingNumber = `BD-${Math.floor(100000000 + Math.random() * 900000000)}`;
    const courier = 'Bluedart Express';

    const fullAddress = `${input.shippingAddress.addressLine}, ${input.shippingAddress.city}, ${input.shippingAddress.state} ${input.shippingAddress.postalCode}`;

    const orderRecord: OrderRecord = {
      id: orderId,
      orderNumber: orderId,
      date: formatDate(now),
      estimatedDelivery: formatDate(estDate),
      courier,
      trackingNumber,
      status: 'CONFIRMED',
      step: 2,
      shippingAddress: fullAddress,
      totalAmount: input.totalAmount,
      subtotal: input.subtotal,
      discount: input.discount,
      shippingFee: input.shippingFee,
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
      createdAt: now.toISOString(),
    };

    // 1. Always persist to browser LocalStorage first so the customer immediately sees their order
    const localExisting = readStorage<OrderRecord[]>(ORDERS_STORAGE_KEY, []);
    const nextLocal = [orderRecord, ...localExisting.filter((o) => o.id !== orderId)];
    writeStorage(ORDERS_STORAGE_KEY, nextLocal);

    // 2. Direct Supabase insert
    if (isSupabaseConfigured()) {
      try {
        const { data: dbOrder, error: dbOrderError } = await supabase
          .from('orders')
          .insert({
            order_number: orderId,
            customer_id: input.customerId || null,
            customer_name: orderRecord.customerName,
            customer_email: orderRecord.customerEmail,
            customer_phone: orderRecord.customerPhone,
            total_amount: orderRecord.totalAmount,
            subtotal: orderRecord.subtotal,
            discount_amount: orderRecord.discount,
            shipping_amount: orderRecord.shippingFee,
            status: 'CONFIRMED',
            payment_status: 'PENDING',
            payment_method: orderRecord.paymentMethod,
            shipping_address: input.shippingAddress,
            tracking_number: trackingNumber,
            courier,
          })
          .select('id')
          .single();

        if (dbOrderError) {
          console.warn('[OrderService] Supabase order insertion notice:', dbOrderError.message);
        } else if (dbOrder?.id) {
          const itemRows = input.items.map((it) => ({
            order_id: dbOrder.id,
            serial_number: it.serialNumber,
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            size: it.size || 'Free Size',
            image_url: it.image || '',
          }));

          const { error: itemsError } = await supabase.from('order_items').insert(itemRows);
          if (itemsError) {
            console.warn('[OrderService] Supabase order items insertion notice:', itemsError.message);
          }
        }
      } catch (err) {
        console.warn('[OrderService] Could not reach Supabase database directly:', err);
      }
    }

    // 3. Fallback backend API notification
    void apiClient
      .post('/orders', {
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
      })
      .catch(() => {});

    // 4. Notify listening UI components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('circleup_orders_updated', { detail: orderRecord }));
    }

    return orderRecord;
  },

  /**
   * Retrieves all orders for the active customer, combining Supabase and LocalStorage.
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

    if (!isSupabaseConfigured()) {
      return relevantLocal;
    }

    try {
      let query = supabase
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
        .order('created_at', { ascending: false });

      if (customerId && cleanEmail) {
        query = query.or(`customer_id.eq.${customerId},customer_email.eq.${cleanEmail}`);
      } else if (customerId) {
        query = query.eq('customer_id', customerId);
      } else if (cleanEmail) {
        query = query.eq('customer_email', cleanEmail);
      }

      const { data, error } = await query;

      if (!error && Array.isArray(data)) {
        const mappedRemote: OrderRecord[] = data.map((row: any) => {
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
            id: row.order_number || row.id,
            orderNumber: row.order_number || row.id,
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
            customerEmail: row.customer_email,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            paymentMethod: row.payment_method || 'COD',
            createdAt: row.created_at || new Date().toISOString(),
            items: rawItems.map((it: any) => ({
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

        // Merge remote and local (deduplicating by id / orderNumber)
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
      console.warn('[OrderService] Supabase fetch error, using LocalStorage:', err);
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
};
