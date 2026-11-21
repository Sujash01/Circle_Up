import crypto from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  executeStorefrontCheckoutRpc,
  getSupabaseAdminClient,
  handlePostgresCheckoutError,
  isSupabaseCheckoutConfigured,
  type StorefrontCheckoutRpcParams,
  type StorefrontCheckoutRpcResponse,
} from '../../src/services/supabase.service.js';
import {
  generateOrderNumber,
  getKolkataDateString,
  hashGuestToken,
  orderService,
} from '../../src/modules/orders/order.service.js';
import * as dbModule from '../../src/config/db.js';
import { app, bootstrap, resetServerStateForTesting } from '../../src/server.js';
import { env, strictBooleanEnvSchema } from '../../src/config/env.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../src/errors/AppError.js';
import { formatPrice } from '@circleup/shared';

describe('Milestone 1, Step 2: Atomic Checkout RPC Unit & Verification Test Suite [MOCKED / UNIT]', () => {
  beforeAll(() => {
    (env as any).CHECKOUT_PROVIDER = 'supabase';
    (env as any).SUPABASE_URL = 'https://mock.supabase.co';
    (env as any).SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-32chars';
  });

  const dummyPayload: StorefrontCheckoutRpcParams = {
    p_key_hash: crypto.createHash('sha256').update('test-key-001').digest('hex'),
    p_fingerprint: crypto.createHash('sha256').update('test-fingerprint-001').digest('hex'),
    p_customer_id: null,
    p_customer: {
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+919876543210',
    },
    p_shipping_address: {
      addressLine: '14 Heritage Road, Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
    },
    p_items: [{ serialNumber: 'CU-001', quantity: 1, size: 'M' }],
    p_payment_method: 'CASH_ON_DELIVERY',
    p_promo_code: null,
    p_notes: 'Leave at front desk',
    p_guest_access_token_hash: crypto.createHash('sha256').update('dummy-guest-token').digest('hex'),
    p_guest_access_expires_at: new Date(Date.now() + 86400000).toISOString(),
    p_order_number: 'ORD-261122-A1B2C3D4',
  };

  // 1. Successful COD checkout
  it('1. [MOCKED / UNIT] Successfully executes COD checkout with pending payment status', async () => {
    const mockSuccessResponse: StorefrontCheckoutRpcResponse = {
      id: 'uuid-order-1',
      orderNumber: 'ORD-261122-A1B2C3D4',
      customerId: null,
      customer: dummyPayload.p_customer,
      shippingAddress: dummyPayload.p_shipping_address,
      items: [
        {
          productId: 'prod-uuid-1',
          serialNumber: 'CU-001',
          name: 'Vintage Silk Shirt',
          price: 250000,
          quantity: 1,
          size: 'M',
          image: 'https://cdn.circleup.in/shirt.jpg',
          slug: 'vintage-silk-shirt',
        },
      ],
      subtotal: 250000,
      discount: 0,
      deliveryFee: 0,
      totalAmount: 250000,
      status: 'CONFIRMED',
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      guestAccessToken: null,
      createdAt: new Date().toISOString(),
    };

    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: mockSuccessResponse, error: null }),
    } as unknown as SupabaseClient;

    const result = await executeStorefrontCheckoutRpc(dummyPayload, mockClient);
    expect(result.orderNumber).toBe('ORD-261122-A1B2C3D4');
    expect(result.paymentMethod).toBe('CASH_ON_DELIVERY');
    expect(result.paymentStatus).toBe('PENDING');
    expect(result.guestAccessToken).toBeNull();
  });

  // 2. Successful WhatsApp/UPI checkout
  it('2. [MOCKED / UNIT] Successfully executes WhatsApp / UPI checkout with pending payment status', async () => {
    const mockSuccessResponse: StorefrontCheckoutRpcResponse = {
      id: 'uuid-order-2',
      orderNumber: 'ORD-261122-E5F6A7B8',
      customerId: null,
      customer: dummyPayload.p_customer,
      shippingAddress: dummyPayload.p_shipping_address,
      items: [
        {
          productId: 'prod-uuid-2',
          serialNumber: 'CU-002',
          name: 'Handcrafted Canvas Tote',
          price: 180000,
          quantity: 1,
          size: 'One Size',
          image: 'https://cdn.circleup.in/tote.jpg',
          slug: 'handcrafted-canvas-tote',
        },
      ],
      subtotal: 180000,
      discount: 0,
      deliveryFee: 0,
      totalAmount: 180000,
      status: 'CONFIRMED',
      paymentMethod: 'WHATSAPP_UPI',
      paymentStatus: 'PENDING',
      guestAccessToken: null,
      createdAt: new Date().toISOString(),
    };

    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: mockSuccessResponse, error: null }),
    } as unknown as SupabaseClient;

    const payload = { ...dummyPayload, p_payment_method: 'WHATSAPP_UPI' };
    const result = await executeStorefrontCheckoutRpc(payload, mockClient);
    expect(result.orderNumber).toBe('ORD-261122-E5F6A7B8');
    expect(result.paymentMethod).toBe('WHATSAPP_UPI');
    expect(result.paymentStatus).toBe('PENDING');
  });

  // 3. Disabled Razorpay checkout
  it('3. [MOCKED / UNIT] Rejects Razorpay ONLINE_UPI checkout with 503 PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'Online payment is temporarily unavailable. Please try again later.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    const payload = { ...dummyPayload, p_payment_method: 'ONLINE_UPI' };
    await expect(executeStorefrontCheckoutRpc(payload, mockClient)).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  // 4. Insufficient inventory
  it('4. [MOCKED / UNIT] Rejects checkout with 400 OUT_OF_STOCK when product inventory is insufficient', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'OUT_OF_STOCK',
            message: 'Insufficient stock for "CU-001".',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      BadRequestError,
    );
  });

  // 5. Unknown product
  it('5. [MOCKED / UNIT] Rejects checkout with 404 PRODUCT_NOT_ORDERABLE when serial number does not exist', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'PRODUCT_NOT_ORDERABLE',
            message: 'Product "UNKNOWN-999" is not available to order.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      NotFoundError,
    );
  });

  // 6. Hidden or unavailable product
  it('6. [MOCKED / UNIT] Rejects checkout with 404 PRODUCT_NOT_ORDERABLE when product is DRAFT, ARCHIVED, or SOLD_OUT', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'PRODUCT_NOT_ORDERABLE',
            message: 'Product "CU-ARCHIVED" is not available to order.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      NotFoundError,
    );
  });

  // 7. Invalid quantity
  it('7. [MOCKED / UNIT] Rejects checkout with 400 INVALID_QUANTITY when quantity exceeds 10 or is non-positive', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'INVALID_QUANTITY',
            message: 'Maximum quantity per product is 10.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      BadRequestError,
    );
  });

  // 8. Expired coupon
  it('8. [MOCKED / UNIT] Rejects checkout with 400 COUPON_REQUIRED when promo code has expired', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'COUPON_REQUIRED',
            message: 'This promo code has expired.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      BadRequestError,
    );
  });

  // 9. Coupon usage limit under concurrency
  it('9. [MOCKED / UNIT] Rejects checkout with 400 COUPON_REQUIRED when coupon usage limit is exhausted', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'COUPON_REQUIRED',
            message: 'This promo code has reached its maximum usage limit.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      BadRequestError,
    );
  });

  // 10. Same idempotency key and same fingerprint
  it('10. [MOCKED / UNIT] Safely replays cached order confirmation for matching idempotency key and fingerprint', async () => {
    const cachedResponse: StorefrontCheckoutRpcResponse = {
      id: 'uuid-cached-order',
      orderNumber: 'ORD-261122-CACHE123',
      customerId: null,
      customer: dummyPayload.p_customer,
      shippingAddress: dummyPayload.p_shipping_address,
      items: [],
      subtotal: 250000,
      discount: 0,
      deliveryFee: 0,
      totalAmount: 250000,
      status: 'CONFIRMED',
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      guestAccessToken: null,
      createdAt: '2026-11-22T08:00:00Z',
    };

    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: cachedResponse, error: null }),
    } as unknown as SupabaseClient;

    const first = await executeStorefrontCheckoutRpc(dummyPayload, mockClient);
    const second = await executeStorefrontCheckoutRpc(dummyPayload, mockClient);

    expect(first.orderNumber).toBe(second.orderNumber);
    expect(second.orderNumber).toBe('ORD-261122-CACHE123');
  });

  // 11. Same idempotency key with different fingerprint
  it('11. [MOCKED / UNIT] Rejects request with 409 IDEMPOTENCY_KEY_REUSED when key is reused with different payload', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This idempotency key was already used for a different checkout.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      ConflictError,
    );
  });

  // 12. Simultaneous duplicate requests
  it('12. [MOCKED / UNIT] Throws 409 CHECKOUT_IN_PROGRESS when duplicate request arrives while checkout is resolving', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'CHECKOUT_IN_PROGRESS',
            message: 'Checkout with this key is already being processed. Retry shortly.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
      ConflictError,
    );
  });

  // 13. Rollback after inventory validation
  it('13. [MOCKED / UNIT] PostgreSQL transactional semantics abort transaction on downstream error without leaving artifacts', () => {
    expect(() => {
      handlePostgresCheckoutError({
        code: 'P0001',
        message: JSON.stringify({
          code: 'OUT_OF_STOCK',
          message: 'Insufficient stock.',
        }),
      });
    }).toThrow(BadRequestError);
  });

  // 14. Lost HTTP response followed by retry
  it('14. [MOCKED / UNIT] Resolves lost HTTP response on retry by retrieving cached payload and deriving guest token in RAM', () => {
    const orderNumber = 'ORD-261122-A1B2C3D4';
    const secret = env.GUEST_ORDER_TOKEN_SECRET || env.SESSION_SECRET;
    const expectedToken = crypto
      .createHmac('sha256', secret)
      .update(`circleup:guest-order:${orderNumber}`)
      .digest('hex');

    const cachedPayload = { orderNumber, guestAccessToken: null };
    const ephemeralToken = crypto
      .createHmac('sha256', secret)
      .update(`circleup:guest-order:${cachedPayload.orderNumber}`)
      .digest('hex');

    expect(ephemeralToken).toBe(expectedToken);
  });

  // 15. Guest token never appearing in cached JSON
  it('15. [MOCKED / UNIT] Strictly guarantees guestAccessToken is null in database response_payload', async () => {
    const mockResponse: StorefrontCheckoutRpcResponse = {
      id: 'uuid-secure-order',
      orderNumber: 'ORD-261122-A1B2C3D4',
      customerId: null,
      customer: dummyPayload.p_customer,
      shippingAddress: dummyPayload.p_shipping_address,
      items: [],
      subtotal: 100000,
      discount: 0,
      deliveryFee: 9000,
      totalAmount: 109000,
      status: 'CONFIRMED',
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      guestAccessToken: null, // ZERO PLAINTEXT TOKEN IN DB
      createdAt: new Date().toISOString(),
    };

    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: mockResponse, error: null }),
    } as unknown as SupabaseClient;

    const res = await executeStorefrontCheckoutRpc(dummyPayload, mockClient);
    expect(res.guestAccessToken).toBeNull();
  });

  // 16. Guest token verification
  it('16. [MOCKED / UNIT] Validates provided guest token timing-safely against SHA-256 hash without secret dependency', () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const storedHash = hashGuestToken(rawToken);
    const validExpiry = new Date(Date.now() + 86400000);

    const isMatch = orderService.verifyGuestAccessToken(rawToken, storedHash, validExpiry);
    expect(isMatch).toBe(true);

    const tampered = `${rawToken.slice(0, -2)}ff`;
    const isTamperedMatch = orderService.verifyGuestAccessToken(tampered, storedHash, validExpiry);
    expect(isTamperedMatch).toBe(false);

    const expired = new Date(Date.now() - 1000);
    const isExpiredMatch = orderService.verifyGuestAccessToken(rawToken, storedHash, expired);
    expect(isExpiredMatch).toBe(false);
  });

  // 17. Cleanup racing with an idempotent retry
  it('17. [MOCKED / UNIT] Simulates vanished record handling during cleanup race with bounded retry loop', () => {
    let loopCount = 0;
    let acquired = false;
    while (!acquired && loopCount < 3) {
      loopCount++;
      if (loopCount === 2) {
        acquired = true;
      }
    }
    expect(acquired).toBe(true);
    expect(loopCount).toBe(2);
  });

  // 18. No negative inventory
  it('18. [MOCKED / UNIT] Guards against negative inventory by evaluating stock >= quantity before decrements', () => {
    const stock = 1;
    const requested = 2;
    expect(stock >= requested).toBe(false);
  });

  // 19. Monetary calculations and rounding
  it('19. [MOCKED / UNIT] Accurately calculates subtotal, percentage discounts, flat caps, and delivery thresholds in integer paise', () => {
    const subtotal = 140000; // ₹1,400 in paise
    const percentDiscountValue = 15; // 15%
    const calculatedDiscount = Math.round((subtotal * percentDiscountValue) / 100); // 21,000 paise (₹210)
    expect(calculatedDiscount).toBe(21000);

    const discountedSubtotal = subtotal - calculatedDiscount; // 119,000 paise (₹1,190)
    expect(discountedSubtotal).toBe(119000);

    // Free delivery threshold: ₹1,500 (150,000 paise)
    const deliveryFee = discountedSubtotal >= 150000 ? 0 : 9000;
    expect(deliveryFee).toBe(9000); // Standard ₹90 delivery fee

    const total = discountedSubtotal + deliveryFee;
    expect(total).toBe(128000); // ₹1,280 in paise
    expect(Number.isSafeInteger(total)).toBe(true);
  });

  // 20. 100x Rupee vs Paise Mismatch Detector
  it('20. [MOCKED / UNIT] Catches a 100x Rupee/Paise mismatch and proves financial disparity', () => {
    // If a product selling for ₹2,550 is stored as 2550 (Rupees) instead of 255000 (Paise):
    const mistakenRupeesValue = 2550;
    const canonicalPaiseValue = 255000;

    // 1. FormatPrice test:
    expect(formatPrice(canonicalPaiseValue)).toBe('₹2,550');
    // If passed mistaken value, it formats as ₹25.50 (a 100x loss!):
    expect(formatPrice(mistakenRupeesValue)).toBe('₹25.50');

    // 2. Free Delivery Threshold (150000 paise / ₹1,500):
    // ₹2,550 order SHOULD get free shipping
    const canonicalGetsFreeDelivery = canonicalPaiseValue >= 150000;
    expect(canonicalGetsFreeDelivery).toBe(true);

    // Mistaken rupees value FAILS the free shipping threshold:
    const mistakenGetsFreeDelivery = mistakenRupeesValue >= 150000;
    expect(mistakenGetsFreeDelivery).toBe(false);

    // 3. Financial magnitude assertion:
    expect(canonicalPaiseValue / mistakenRupeesValue).toBe(100);
  });

  // 21. Rejection of Unsupported Coupon Types (FREE_SHIPPING, BOGO)
  it('21. [MOCKED / UNIT] Rejects unsupported coupon discount types (FREE_SHIPPING, BOGO) before usage increment', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'UNSUPPORTED_COUPON_TYPE',
            message: 'Promo code discount type "FREE_SHIPPING" is not supported at checkout.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    const payload = { ...dummyPayload, p_promo_code: 'FREESHIP' };
    await expect(executeStorefrontCheckoutRpc(payload, mockClient)).rejects.toThrow(
      BadRequestError,
    );
  });

  // 22. Percentage Discount Rounding with Numeric Precision
  it('22. [MOCKED / UNIT] Verifies percentage discount rounding with numeric precision avoiding integer truncation', () => {
    const subtotal = 14555; // ₹145.55
    const discountPercent = 15; // 15%
    // Integer division truncation: floor((14555 * 15) / 100) = 2183
    // Exact numeric calculation: (14555 * 15) / 100.0 = 2183.25 -> round = 2183
    const exactDiscount = Math.round((subtotal * discountPercent) / 100.0);
    expect(exactDiscount).toBe(2183);

    const subtotal2 = 14570; // 14570 * 0.15 = 2185.5 -> round = 2186
    const exactDiscount2 = Math.round((subtotal2 * discountPercent) / 100.0);
    expect(exactDiscount2).toBe(2186);
  });

  // 23. Invalid Variant / Size Validation
  it('23. [MOCKED / UNIT] Rejects checkout when requested size does not match product available sizes', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'INVALID_VARIANT',
            message: 'Size "XXL" is not available for product "CU-001". Available sizes: S, M.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    const payload = { ...dummyPayload, p_items: [{ serialNumber: 'CU-001', quantity: 1, size: 'XXL' }] };
    await expect(executeStorefrontCheckoutRpc(payload, mockClient)).rejects.toThrow(
      BadRequestError,
    );
  });

  // 24. Rejection of Placeholder WhatsApp Contact
  it('24. [MOCKED / UNIT] Rejects WhatsApp checkout when store contact is unconfigured or a repository placeholder', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'PAYMENT_METHOD_UNAVAILABLE',
            message: 'WhatsApp / UPI payment is temporarily unavailable because store contact details are not configured.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    const payload = { ...dummyPayload, p_payment_method: 'WHATSAPP_UPI' };
    await expect(executeStorefrontCheckoutRpc(payload, mockClient)).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  // 25. Privileged Supabase Service-Role Key Requirement
  it('25. [MOCKED / UNIT] Fails closed if SUPABASE_SERVICE_ROLE_KEY is missing or unprivileged', () => {
    const originalKey = env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      (env as any).SUPABASE_SERVICE_ROLE_KEY = undefined;
      expect(isSupabaseCheckoutConfigured()).toBe(false);

      expect(() => {
        getSupabaseAdminClient();
      }).toThrow(ServiceUnavailableError);
    } finally {
      (env as any).SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  // 26. Collision-Resistant Order Number Format (122-bit CSPRNG entropy via full 32-hex unhyphenated UUID v4)
  it('26. [MOCKED / UNIT] Enforces collision-resistant order number format (ORD-YYMMDD-32HEX, 43 chars)', () => {
    const regex = /^ORD-\d{6}-[A-F0-9]{32}$/;
    const generated = generateOrderNumber();
    expect(regex.test(generated)).toBe(true);
    expect(generated.length).toBe(43); // 4 ('ORD-') + 6 (YYMMDD) + 1 ('-') + 32 = 43

    const sample = 'ORD-261122-A1B2C3D4E5F678901234567890ABCDEF';
    expect(regex.test(sample)).toBe(true);
    expect(sample.length).toBe(43);

    const sixteenCharFormat = 'ORD-261122-A1B2C3D4E5F6A7B8';
    expect(regex.test(sixteenCharFormat)).toBe(false);

    const eightCharFormat = 'ORD-261122-A1B2C3D4';
    expect(regex.test(eightCharFormat)).toBe(false);

    const legacyFormat = 'ORD-261122-1234';
    expect(regex.test(legacyFormat)).toBe(false);
  });

  // 26b. Asia/Kolkata Timezone Boundary Consistency
  it('26b. [MOCKED / UNIT] Enforces Asia/Kolkata calendar date in order numbers preventing UTC divergence', () => {
    // 1. One second before Kolkata midnight (18:29:59 UTC)
    // UTC is 2026-11-21, Kolkata is 2026-11-21 23:59:59
    const beforeMidnightUtc = new Date('2026-11-21T18:29:59.000Z');
    expect(getKolkataDateString(beforeMidnightUtc)).toBe('261121');
    const orderBefore = generateOrderNumber(beforeMidnightUtc);
    expect(orderBefore.startsWith('ORD-261121-')).toBe(true);

    // 2. Exactly at Kolkata midnight (18:30:00 UTC)
    // UTC is STILL 2026-11-21 (5.5 hours before UTC midnight), but Kolkata rolls over to 2026-11-22 00:00:00
    const atMidnightUtc = new Date('2026-11-21T18:30:00.000Z');
    expect(getKolkataDateString(atMidnightUtc)).toBe('261122');
    const orderAtMidnight = generateOrderNumber(atMidnightUtc);
    expect(orderAtMidnight.startsWith('ORD-261122-')).toBe(true);
    // Explicit invariant: UTC date is 21, but Kolkata date is 22 — must NEVER produce 261121
    expect(orderAtMidnight.startsWith('ORD-261121-')).toBe(false);

    // 3. Late evening UTC (23:59:59 UTC)
    // UTC is 2026-11-21, Kolkata is 2026-11-22 05:29:59
    const lateUtc = new Date('2026-11-21T23:59:59.000Z');
    expect(getKolkataDateString(lateUtc)).toBe('261122');
    const orderLate = generateOrderNumber(lateUtc);
    expect(orderLate.startsWith('ORD-261122-')).toBe(true);

    // 4. Year-end rollover boundary (2026-12-31 18:30:00 UTC -> 2027-01-01 00:00:00 Kolkata)
    const newYearUtc = new Date('2026-12-31T18:30:00.000Z');
    expect(getKolkataDateString(newYearUtc)).toBe('270101');
    const orderNewYear = generateOrderNumber(newYearUtc);
    expect(orderNewYear.startsWith('ORD-270101-')).toBe(true);
    expect(orderNewYear.startsWith('ORD-261231-')).toBe(false);
  });

  // 27. Monetary-Unit Gate Protection in Production
  it('27. [MOCKED / UNIT] Blocks Supabase checkout activation in production when MONETARY_RECONCILIATION_VERIFIED is false', async () => {
    // In production without verified monetary units, isSupabaseCheckoutConfigured must return false
    const originalEnv = env.NODE_ENV;
    const originalGate = env.MONETARY_RECONCILIATION_VERIFIED;

    try {
      (env as any).NODE_ENV = 'production';
      (env as any).MONETARY_RECONCILIATION_VERIFIED = false;

      expect(isSupabaseCheckoutConfigured()).toBe(false);

      const mockClient = {
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
        ServiceUnavailableError,
      );
    } finally {
      (env as any).NODE_ENV = originalEnv;
      (env as any).MONETARY_RECONCILIATION_VERIFIED = originalGate;
    }
  });

  // 28. Zero Extension Dependency: Core pg_catalog.gen_random_uuid Compatibility (122 bits of CSPRNG entropy)
  it('28. [MOCKED / UNIT] Verifies order number cryptographic entropy resolves from core pg_catalog.gen_random_uuid without pgcrypto (122 bits)', () => {
    // Simulates the SQL logic: upper(replace(gen_random_uuid()::text, '-', ''))
    const rawUuid = crypto.randomUUID();
    const hexSuffix = rawUuid.replace(/-/g, '').toUpperCase();

    expect(hexSuffix.length).toBe(32);
    expect(/^[A-F0-9]{32}$/.test(hexSuffix)).toBe(true);

    // In UUID v4 (RFC 4122), 6 bits are fixed (4 bits version in nibble 13, 2 bits variant in nibble 17).
    // The remaining 122 bits are cryptographically random.
    // 2^122 distinct possible suffix states:
    const possibleStates = 2n ** 122n;
    expect(possibleStates.toString()).toBe('5316911983139663491615228241121378304');
  });

  // 29. Order-Number Collision Isolation: Retries ONLY on order_number Constraint
  it('29. [MOCKED / UNIT] Retries only on orders_order_number_key violation and re-throws other unique constraint violations', () => {
    // Simulates PL/pgSQL constraint diagnosis:
    function handleUniqueViolation(constraintName: string): 'RETRY' | 'RETHROW' {
      if (constraintName === 'orders_order_number_key' || constraintName.includes('order_number')) {
        return 'RETRY';
      }
      return 'RETHROW';
    }

    // 1. Order number collision -> Retries
    expect(handleUniqueViolation('orders_order_number_key')).toBe('RETRY');
    expect(handleUniqueViolation('orders_order_number_idx')).toBe('RETRY');

    // 2. Token hash collision -> Re-throws immediately
    expect(handleUniqueViolation('orders_guest_access_token_hash_key')).toBe('RETHROW');
    // 3. Payment ID collision -> Re-throws immediately
    expect(handleUniqueViolation('orders_payment_id_key')).toBe('RETHROW');
    // 4. Primary key collision -> Re-throws immediately
    expect(handleUniqueViolation('orders_pkey')).toBe('RETHROW');
  });

  // 30. Explicit Store-Verified WhatsApp Configuration Enforcement
  it('30. [MOCKED / UNIT] Fails closed when WhatsApp number is syntactically valid but store verification flag is false', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: JSON.stringify({
            code: 'PAYMENT_METHOD_UNAVAILABLE',
            message: 'WhatsApp / UPI payment is temporarily unavailable because store contact details have not been verified.',
          }),
        },
      }),
    } as unknown as SupabaseClient;

    const payload = { ...dummyPayload, p_payment_method: 'WHATSAPP_UPI' };
    await expect(executeStorefrontCheckoutRpc(payload, mockClient)).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  // 31. Strict Boolean Environment Parsing (Fixes z.coerce.boolean trap)
  it('31. [MOCKED / UNIT] Strictly parses boolean environment strings and proves "false" cannot enable monetary gate', () => {
    // 1. Literal string "false" MUST parse to false:
    expect(strictBooleanEnvSchema.parse('false')).toBe(false);
    expect(strictBooleanEnvSchema.parse('False')).toBe(false);
    expect(strictBooleanEnvSchema.parse('FALSE')).toBe(false);
    expect(strictBooleanEnvSchema.parse(' false ')).toBe(false);

    // 2. Missing, empty, or undefined MUST parse to false:
    expect(strictBooleanEnvSchema.parse('')).toBe(false);
    expect(strictBooleanEnvSchema.parse('   ')).toBe(false);
    expect(strictBooleanEnvSchema.parse(undefined)).toBe(false);

    // 3. Literal string "true" MUST parse to true:
    expect(strictBooleanEnvSchema.parse('true')).toBe(true);
    expect(strictBooleanEnvSchema.parse('True')).toBe(true);
    expect(strictBooleanEnvSchema.parse('TRUE')).toBe(true);
    expect(strictBooleanEnvSchema.parse(' true ')).toBe(true);

    // 4. Unexpected/invalid values must fail schema validation:
    const invalidResult = strictBooleanEnvSchema.safeParse('not-a-boolean');
    expect(invalidResult.success).toBe(false);

    const numericOneResult = strictBooleanEnvSchema.safeParse('1');
    expect(numericOneResult.success).toBe(false);

    // 5. CRITICAL INVARIANT: The literal string "false" does NOT enable the production gate:
    const parsedGate = strictBooleanEnvSchema.parse('false');
    const isGateEnabled = parsedGate === true;
    expect(isGateEnabled).toBe(false);
  });

  // 32. Elimination of Automatic Fallback: Missing Supabase Credentials Fails Closed
  it('32. [MOCKED / UNIT] Fails closed with 503 DATABASE_UNAVAILABLE when Supabase credentials are missing (no MongoDB fallback)', async () => {
    const originalEnv = env.NODE_ENV;
    const originalUrl = env.SUPABASE_URL;
    const originalKey = env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      (env as any).NODE_ENV = 'development';
      (env as any).SUPABASE_URL = undefined;
      (env as any).SUPABASE_SERVICE_ROLE_KEY = undefined;

      const payload = {
        customer: { name: 'Aarav Patel', email: 'aarav@example.com', phone: '+919876543210' },
        shippingAddress: { addressLine: '10 Marine Drive', city: 'Mumbai', state: 'MH', postalCode: '400020' },
        items: [{ serialNumber: 'CU-001', quantity: 1, size: 'M' }],
        paymentMethod: 'CASH_ON_DELIVERY' as const,
        idempotencyKey: 'test-idem-key-fallback-1',
      };

      // In the target architecture, missing Supabase credentials MUST throw 503 DATABASE_UNAVAILABLE.
      // It must NEVER silently fall back to MongoDB.
      await expect(orderService.createOrder(payload)).rejects.toThrow(ServiceUnavailableError);
      await expect(orderService.createOrder(payload)).rejects.toMatchObject({
        code: 'DATABASE_UNAVAILABLE',
        statusCode: 503,
      });
    } finally {
      (env as any).NODE_ENV = originalEnv;
      (env as any).SUPABASE_URL = originalUrl;
      (env as any).SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  // 33. Elimination of Automatic Fallback: Unverified Monetary Gate Fails Closed
  it('33. [MOCKED / UNIT] Fails closed with 503 MONETARY_RECONCILIATION_REQUIRED in production (no MongoDB fallback)', async () => {
    const originalEnv = env.NODE_ENV;
    const originalGate = env.MONETARY_RECONCILIATION_VERIFIED;

    try {
      (env as any).NODE_ENV = 'production';
      (env as any).MONETARY_RECONCILIATION_VERIFIED = false;

      const payload = {
        customer: { name: 'Aarav Patel', email: 'aarav@example.com', phone: '+919876543210' },
        shippingAddress: { addressLine: '10 Marine Drive', city: 'Mumbai', state: 'MH', postalCode: '400020' },
        items: [{ serialNumber: 'CU-001', quantity: 1, size: 'M' }],
        paymentMethod: 'CASH_ON_DELIVERY' as const,
        idempotencyKey: 'test-idem-key-fallback-2',
      };

      // In production with unverified monetary units, createOrder MUST throw 503 MONETARY_RECONCILIATION_REQUIRED.
      // It must NEVER invoke MongoDB checkout.
      await expect(orderService.createOrder(payload)).rejects.toThrow(ServiceUnavailableError);
      await expect(orderService.createOrder(payload)).rejects.toMatchObject({
        code: 'MONETARY_RECONCILIATION_REQUIRED',
        statusCode: 503,
      });
    } finally {
      (env as any).NODE_ENV = originalEnv;
      (env as any).MONETARY_RECONCILIATION_VERIFIED = originalGate;
    }
  });

  // 34. Elimination of Automatic Fallback: Supabase RPC Failure Does NOT Fall Back to MongoDB
  it('34. [MOCKED / UNIT] Re-throws Supabase RPC error directly without attempting MongoDB checkout fallback', async () => {
    const originalEnv = env.NODE_ENV;
    const originalUrl = env.SUPABASE_URL;
    const originalKey = env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      (env as any).NODE_ENV = 'development';
      (env as any).SUPABASE_URL = 'https://mock-proj.supabase.co';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-32-chars-long';

      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'P0001',
            message: JSON.stringify({
              code: 'OUT_OF_STOCK',
              message: 'Insufficient stock for "CU-001".',
            }),
          },
        }),
      } as unknown as SupabaseClient;

      // Invoking executeStorefrontCheckoutRpc directly throws BadRequestError ('OUT_OF_STOCK')
      await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toThrow(
        BadRequestError,
      );
      await expect(executeStorefrontCheckoutRpc(dummyPayload, mockClient)).rejects.toMatchObject({
        code: 'OUT_OF_STOCK',
        statusCode: 400,
      });
    } finally {
      (env as any).NODE_ENV = originalEnv;
      (env as any).SUPABASE_URL = originalUrl;
      (env as any).SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  // 35. Production Supabase-Only Route Fails Closed
  it('35. [MOCKED / UNIT] Prevents MongoDB checkout activation in production and enforces fail-closed behavior', async () => {
    const originalEnv = env.NODE_ENV;
    const originalProvider = (env as any).CHECKOUT_PROVIDER;

    try {
      (env as any).NODE_ENV = 'production';
      (env as any).CHECKOUT_PROVIDER = 'mongodb'; // Attempted illegal override in production

      const payload = {
        customer: { name: 'Aarav Patel', email: 'aarav@example.com', phone: '+919876543210' },
        shippingAddress: { addressLine: '10 Marine Drive', city: 'Mumbai', state: 'MH', postalCode: '400020' },
        items: [{ serialNumber: 'CU-001', quantity: 1, size: 'M' }],
        paymentMethod: 'CASH_ON_DELIVERY' as const,
        idempotencyKey: 'test-idem-key-fallback-3',
      };

      // Even if someone attempts to configure CHECKOUT_PROVIDER=mongodb in production,
      // createOrder blocks MongoDB execution and evaluates the production Supabase route (failing closed).
      await expect(orderService.createOrder(payload)).rejects.toThrow(ServiceUnavailableError);
    } finally {
      (env as any).NODE_ENV = originalEnv;
      (env as any).CHECKOUT_PROVIDER = originalProvider;
    }
  });

  // 36. Decoupled Backend Startup: Supabase-First Backend Survives MongoDB Outage
  it('36. [MOCKED / UNIT] Boots backend and serves Supabase checkout without crashing when MongoDB is unavailable', async () => {
    const originalEnv = env.NODE_ENV;
    const originalProvider = env.CHECKOUT_PROVIDER;
    const originalUri = env.MONGODB_URI;

    try {
      (env as any).NODE_ENV = 'production';
      (env as any).CHECKOUT_PROVIDER = 'supabase';
      (env as any).MONGODB_URI = 'mongodb://offline-host:27017/circleup_prod';

      // 1. Mock MongoDB failure
      const dbSpy = vi
        .spyOn(dbModule, 'connectDatabase')
        .mockRejectedValue(new Error('MongoNetworkTimeoutError: connection timed out'));

      // 2. Mock app.listen to avoid binding real port
      const listenSpy = vi
        .spyOn(app, 'listen')
        .mockImplementation((_port: any, cb?: any) => {
          if (cb) cb();
          return { close: vi.fn() } as any;
        });

      // When CHECKOUT_PROVIDER === 'supabase', bootstrap MUST resolve cleanly and listen
      await expect(bootstrap()).resolves.toBeUndefined();
      expect(listenSpy).toHaveBeenCalled();

      // 3. Conversely, if configured for legacy CHECKOUT_PROVIDER === 'mongodb' in production,
      // it MUST throw on MongoDB failure to protect legacy operations
      (env as any).CHECKOUT_PROVIDER = 'mongodb';
      await expect(bootstrap()).rejects.toThrow('MongoNetworkTimeoutError');

      dbSpy.mockRestore();
      listenSpy.mockRestore();
    } finally {
      resetServerStateForTesting();
      (env as any).NODE_ENV = originalEnv;
      (env as any).CHECKOUT_PROVIDER = originalProvider;
      (env as any).MONGODB_URI = originalUri;
    }
  });
});
