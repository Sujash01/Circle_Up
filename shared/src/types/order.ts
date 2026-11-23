import type { OrderStatus, PaymentStatus } from '../constants/enums.js';

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
  customerId?: string;
  guestAccessToken?: string;
  guestAccessTokenHash?: string;
  guestAccessExpiresAt?: string;
  customer: ICustomerInfo;
  shippingAddress: IShippingAddress;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: 'WHATSAPP_UPI' | 'CASH_ON_DELIVERY' | 'ONLINE_UPI';
  paymentStatus: PaymentStatus;
  utrNumber?: string;
  paymentProofUrl?: string;
  marketingConsent?: boolean;
  marketingConsentAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateOrderPayload {
  customerId?: string;
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

