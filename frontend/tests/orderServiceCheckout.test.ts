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
    expect(getCheckoutPaymentLabel('RAZORPAY', 'PENDING')).toContain('Payment pending');
    expect(getCheckoutPaymentLabel('RAZORPAY', 'PAID')).toContain('received and verified');
  });

  it('explains unavailable online payment without implying payment succeeded', () => {
    const error = new ApiClientError('Unavailable', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');
    expect(getCheckoutErrorMessage(error)).toMatch(/temporarily unavailable/i);
    expect(getCheckoutErrorMessage(error)).toMatch(/No payment was taken/i);
  });

  it('explains that Cash on Delivery is disallowed and requires Razorpay', () => {
    const error = new ApiClientError('Disallowed', 400, 'PAYMENT_METHOD_DISALLOWED');
    expect(getCheckoutErrorMessage(error)).toMatch(/Cash on Delivery is no longer available/i);
    expect(getCheckoutErrorMessage(error)).toMatch(/Razorpay/i);
  });

  it('verifies Razorpay payment signature via the backend endpoint', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        data: {
          order: {
            orderNumber: 'ORD-261123-VERIFY',
            subtotal: 255000,
            totalAmount: 255000,
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            paymentMethod: 'RAZORPAY',
            customer: { name: 'Verified Customer', email: 'verified@example.com' },
          },
          items: [],
          paymentStatus: 'PAID',
          status: 'CONFIRMED',
        },
      },
    } as never);

    const verified = await orderService.verifyRazorpayPayment({
      orderNumber: 'ORD-261123-VERIFY',
      razorpay_order_id: 'order_test_123',
      razorpay_payment_id: 'pay_test_456',
      razorpay_signature: 'test_signature',
    });

    expect(verified.orderNumber).toBe('ORD-261123-VERIFY');
    expect(verified.paymentStatus).toBe('PAID');
    expect(verified.status).toBe('CONFIRMED');
    expect(verified.paymentMethod).toBe('RAZORPAY');
  });

  it('releases pending reservation via the cancel endpoint on dismissal', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        data: { cancelled: true },
      },
    } as never);

    const cancelled = await orderService.cancelPendingReservation({
      orderNumber: 'ORD-261123-CANCEL',
      reason: 'Checkout modal dismissed',
    });

    expect(cancelled).toBe(true);
    expect(postSpy).toHaveBeenCalledWith(
      '/payments/razorpay/cancel',
      expect.objectContaining({ orderNumber: 'ORD-261123-CANCEL' }),
      expect.anything(),
    );
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
    expect(window.localStorage.getItem(ORDERS_STORAGE_KEY)).toBeNull();
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

  it('loads customer orders from the backend and propagates API failures without local fallback', async () => {
    const localOrder = { id: 'LOCAL-ONLY', orderNumber: 'LOCAL-ONLY' };
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([localOrder]));
    const getSpy = vi.spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('Order service unavailable'))
      .mockResolvedValueOnce({ data: { data: [] } } as never);
    await expect(orderService.getOrders('customer-uuid', 'shopper@example.com')).rejects.toThrow('Order service unavailable');

    await expect(orderService.getOrders('customer-uuid')).resolves.toEqual([]);
    expect(getSpy).toHaveBeenCalledWith('/orders/my-orders');
  });
});
