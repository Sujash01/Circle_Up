export interface IOrderItem {
  serialNumber: string;
  name: string;
  price: number;
  quantity: number;
  size?: string;
  image?: string;
  slug?: string;
}

export interface ICustomerInfo {
  name: string;
  email: string;
  phone: string;
}

export interface IShippingAddress {
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  landmark?: string;
}

export interface IOrder {
  id?: string;
  orderNumber: string;
  customer: ICustomerInfo;
  shippingAddress: IShippingAddress;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalAmount: number;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  paymentMethod: 'WHATSAPP_UPI' | 'CASH_ON_DELIVERY' | 'ONLINE_UPI';
  paymentStatus: 'PENDING' | 'PAID';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateOrderPayload {
  customer: ICustomerInfo;
  shippingAddress: IShippingAddress;
  items: Array<{
    serialNumber: string;
    quantity: number;
    size?: string;
  }>;
  promoCode?: string;
  paymentMethod: 'WHATSAPP_UPI' | 'CASH_ON_DELIVERY' | 'ONLINE_UPI';
  notes?: string;
}

