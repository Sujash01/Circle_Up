import { z } from 'zod';
import { OrderStatus, PaymentStatus } from '../constants/enums.js';
import { moneyPaiseSchema } from './money.js';

export const cartItemSchema = z.object({
  key: z.string(),
  productId: z.string(),
  name: z.string(),
  slug: z.string(),
  price: moneyPaiseSchema,
  quantity: z.number().int().positive().default(1),
  size: z.string().optional(),
  image: z.string().optional(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const orderItemSchema = z.object({
  productId: z.string().optional(),
  serialNumber: z.string().min(1),
  name: z.string().min(1),
  price: moneyPaiseSchema,
  quantity: z.number().int().min(1).max(10).default(1),
  size: z.string().optional(),
  image: z.string().optional(),
  slug: z.string().optional(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;
export type IOrderItem = OrderItem;

export const customerInfoSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
  phone: z.string().min(8, 'Phone number must be at least 8 digits').trim(),
});
export type CustomerInfo = z.infer<typeof customerInfoSchema>;
export type ICustomerInfo = CustomerInfo;

export const shippingAddressSchema = z.object({
  addressLine: z.string().min(5, 'Address line is required').trim(),
  city: z.string().min(2, 'City is required').trim(),
  state: z.string().min(2, 'State is required').trim(),
  postalCode: z.string().min(3, 'Postal code is required').trim(),
  country: z.string().default('India'),
  landmark: z.string().optional(),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;
export type IShippingAddress = ShippingAddress;

export const orderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
]);

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'SHIPPED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'REFUNDED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
  CANCELLED: [],
} as const;

export function canTransitionOrderStatus(currentStatus: OrderStatus, nextStatus: OrderStatus): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = ORDER_STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && (allowed as readonly string[]).includes(nextStatus));
}

export const paymentMethodSchema = z.enum([
  'WHATSAPP_UPI',
  'CASH_ON_DELIVERY',
  'ONLINE_UPI',
  'RAZORPAY',
]);

export const paymentStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
]);

export const orderSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(),
  orderNumber: z.string(),
  customerId: z.string().optional(),
  guestAccessToken: z.string().optional(),
  guestAccessTokenHash: z.string().optional(),
  guestAccessExpiresAt: z.string().optional(),
  customer: customerInfoSchema,
  shippingAddress: shippingAddressSchema,
  items: z.array(orderItemSchema).min(1),
  subtotal: moneyPaiseSchema,
  discount: moneyPaiseSchema.default(0),
  deliveryFee: moneyPaiseSchema.default(0),
  totalAmount: moneyPaiseSchema,
  status: orderStatusSchema.default('PENDING'),
  paymentMethod: paymentMethodSchema.default('RAZORPAY'),
  paymentStatus: paymentStatusSchema.default('PENDING'),
  paymentId: z.string().optional(),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
  utrNumber: z.string().optional(),
  paymentProofUrl: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  marketingConsentAt: z.string().optional(),
  promoCode: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Order = z.infer<typeof orderSchema>;
export type IOrder = Order;

export const createOrderPayloadSchema = z.object({
  customerId: z.string().optional(),
  customer: customerInfoSchema.strict(),
  shippingAddress: shippingAddressSchema.strict(),
  items: z.array(
    z.object({
      serialNumber: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
      quantity: z.number().int().min(1).max(10),
      size: z.string().optional(),
    }).strict(),
  ).min(1, 'Order must contain at least one item').max(20),
  promoCode: z.string().trim().max(64).optional(),
  paymentMethod: paymentMethodSchema.default('RAZORPAY'),
  marketingConsent: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
}).strict();
export type CreateOrderPayload = z.infer<typeof createOrderPayloadSchema>;
