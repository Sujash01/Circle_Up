import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiClientError } from '../src/services/apiClient';
import { getCheckoutErrorMessage, getCheckoutPaymentLabel, orderService, ORDERS_STORAGE_KEY, type CreateOrderInput } from '../src/services/orderService';

const input: CreateOrderInput = {
  customer: { name: 'Test Shopper', email: 'shopper@example.com', phone: '+919876543210' },
  shippingAddress: {
    addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
  },
  items: [{ serialNumber: 'CU-001', name: 'Test product', price: 999999, quantity: 1 }],
  subtotal: 999999,
  discount: 0,
  shippingFee: 0,
  totalAmount: 999999,
  paymentMethod: 'WHATSAPP_UPI',
  promoCode: 'CIRCLE20',
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('orderService checkout confirmation', () => {
  it('labels COD and WhatsApp payments as pending and verified payments as paid', () => {
    expect(getCheckoutPaymentLabel('CASH_ON_DELIVERY', 'PENDING')).toContain('Payment due on delivery');
    expect(getCheckoutPaymentLabel('WHATSAPP_UPI', 'PENDING')).toContain('pending verification');
    expect(getCheckoutPaymentLabel('WHATSAPP_UPI', 'PAID')).toContain('received and verified');
  });

  it('explains unavailable online payment without implying payment succeeded', () => {
    const error = new ApiClientError('Unavailable', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');
    expect(getCheckoutErrorMessage(error)).toMatch(/temporarily unavailable/i);
    expect(getCheckoutErrorMessage(error)).toMatch(/No payment was taken/i);
  });

  it('explains unavailable WhatsApp / UPI configuration clearly', () => {
    const error = new ApiClientError('Unavailable', 503, 'PAYMENT_METHOD_UNAVAILABLE');
    expect(getCheckoutErrorMessage(error)).toMatch(/store payment contact is not configured/i);
    expect(getCheckoutErrorMessage(error)).toMatch(/Cash on Delivery/i);
  });

  it('does not create a local order or tracking details when the backend rejects checkout', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Database unavailable'));

    await expect(orderService.createOrder(input)).rejects.toThrow('Database unavailable');
    expect(window.localStorage.getItem(ORDERS_STORAGE_KEY)).toBeNull();
  });

  it('requires a persisted order response and uses server totals without invented tracking', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        data: {
          orderNumber: 'ORD-261118-1234',
          subtotal: 255000,
          discount: 0,
          deliveryFee: 0,
          totalAmount: 255000,
          status: 'CONFIRMED',
          paymentMethod: 'WHATSAPP_UPI',
          paymentStatus: 'PAID',
          createdAt: '2026-11-18T00:00:00.000Z',
          customer: input.customer,
          shippingAddress: input.shippingAddress,
          items: [{ serialNumber: 'CU-001', name: 'Server product', price: 255000, quantity: 1, size: 'M' }],
        },
      },
    } as never);

    const order = await orderService.createOrder(input);

    expect(order.orderNumber).toBe('ORD-261118-1234');
    expect((postSpy.mock.calls[0]?.[1] as { promoCode?: string }).promoCode).toBe('CIRCLE20');
    expect(order.subtotal).toBe(255000);
    expect(order.items[0]?.price).toBe(255000);
    expect(order.paymentStatus).toBe('PAID');
    expect(getCheckoutPaymentLabel(order.paymentMethod, order.paymentStatus)).toContain('received and verified');
    expect(order.trackingNumber).toBe('');
    expect(order.courier).toBe('');
    expect(window.localStorage.getItem(ORDERS_STORAGE_KEY)).not.toBeNull();
  });

  it('rejects a successful HTTP response that contains no persisted order identity', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } } as never);

    await expect(orderService.createOrder(input)).rejects.toThrow('persisted order confirmation');
    expect(window.localStorage.getItem(ORDERS_STORAGE_KEY)).toBeNull();
  });

  it('does not invent a carrier or waybill when tracking data is absent', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        data: {
          orderNumber: 'ORD-261118-5678',
          subtotal: 255000,
          discount: 0,
          deliveryFee: 0,
          totalAmount: 255000,
          status: 'CONFIRMED',
          createdAt: '2026-11-18T00:00:00.000Z',
          items: [{ serialNumber: 'CU-001', name: 'Server product', price: 255000, quantity: 1 }],
        },
      },
    } as never);

    const order = await orderService.trackOrderByNumber('ORD-261118-5678');

    expect(order.courier).toBe('');
    expect(order.trackingNumber).toBe('');
  });
});
