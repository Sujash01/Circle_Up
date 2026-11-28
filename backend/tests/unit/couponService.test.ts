import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  coupon: null as Record<string, unknown> | null,
  promotions: [] as Array<Record<string, unknown>>,
  customerUsage: 0,
  settings: {
    announcementText: 'Free plastic-free packaging',
    announcementLink: '/new-arrivals',
    isAnnouncementActive: true,
    announcementCouponCode: '',
    announcementStartsAt: null as string | null,
    announcementEndsAt: null as string | null,
    isWhatsappVerified: false,
    whatsappNumber: '',
  },
  failure: null as Error | null,
}));
vi.mock('../../src/repositories/coupon.repository.js', () => ({
  couponRepository: {
    findByCode: async () => {
      if (state.failure) throw state.failure;
      return state.coupon;
    },
    listPromotions: async () => {
      if (state.failure) throw state.failure;
      return state.promotions;
    },
    countCustomerUsage: async () => state.customerUsage,
  },
}));
vi.mock('../../src/repositories/settings.repository.js', () => ({
  getConfiguredWhatsappNumber: () => '',
  settingsRepository: {
    getSettings: async () => state.settings,
  },
}));

import { couponService } from '../../src/services/coupon.service.js';

const activeCoupon = (values: Record<string, unknown> = {}) => ({
  code: 'SAVE10', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 0,
  maxDiscountAmount: undefined, usageCount: 0, usageLimit: undefined, isActive: true,
  perCustomerLimit: 1, targetTier: 'ALL', appliesTo: 'ALL', applicableProductIds: [],
  targetPages: ['all'], cooldownHours: 24, showInHeader: false, showInExitIntent: false,
  autoApply: false, headerCtaLabel: 'Copy Code',
  startsAt: undefined, expiresAt: undefined, ...values,
});

describe('Supabase-backed coupon validation rules', () => {
  beforeEach(() => {
    state.coupon = activeCoupon();
    state.promotions = [];
    state.customerUsage = 0;
    state.settings = {
      announcementText: 'Free plastic-free packaging',
      announcementLink: '/new-arrivals',
      isAnnouncementActive: true,
      announcementCouponCode: '',
      announcementStartsAt: null,
      announcementEndsAt: null,
      isWhatsappVerified: false,
      whatsappNumber: '',
    };
    state.failure = null;
  });

  it('validates percentage discounts and applies the maximum discount cap', async () => {
    state.coupon = activeCoupon({ maxDiscountAmount: 2000 });
    await expect(couponService.validateCoupon('save10', 50000)).resolves.toMatchObject({
      valid: true, code: 'SAVE10', discountInPaise: 2000,
    });
  });

  it('validates flat discounts in the existing stored unit and caps them at subtotal', async () => {
    state.coupon = activeCoupon({ discountType: 'FLAT', value: 30000 });
    await expect(couponService.validateCoupon('SAVE10', 25000)).resolves.toMatchObject({ valid: true, discountInPaise: 25000 });
  });

  it.each([
    ['inactive', { isActive: false }],
    ['expired', { expiresAt: '2020-01-01T00:00:00.000Z' }],
    ['not yet active', { startsAt: '2999-01-01T00:00:00.000Z' }],
    ['usage limited', { usageCount: 2, usageLimit: 2 }],
    ['minimum order', { minOrderAmount: 60000 }],
  ])('rejects %s coupons without applying a discount', async (_name, fields) => {
    state.coupon = activeCoupon(fields);
    const result = await couponService.validateCoupon('SAVE10', 50000);
    expect(result.valid).toBe(false);
    expect(result.discountInPaise).toBe(0);
  });

  it.each(['FREE_SHIPPING', 'BOGO'])('does not interpret unsupported %s coupons as flat discounts', async (discountType) => {
    state.coupon = activeCoupon({ discountType, value: 10000 });
    const result = await couponService.validateCoupon('SAVE10', 50000);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('not supported at checkout');
  });

  it('does not report validity if Supabase coupon storage fails', async () => {
    state.failure = new Error('storage offline');
    await expect(couponService.validateCoupon('SAVE10', 50000)).rejects.toThrow('storage offline');
  });

  it('enforces customer-specific restriction without allowing email-only bypass when assignedCustomerId is set', async () => {
    const customerId = '11111111-1111-4111-8111-111111111111';
    state.coupon = activeCoupon({
      code: 'SORRY250',
      discountType: 'FLAT',
      value: 25000,
      assignedCustomerId: customerId,
      assignedCustomerEmail: 'asha@example.com',
    });

    // Missing both ID and email
    await expect(couponService.validateCoupon('SORRY250', 50000)).resolves.toMatchObject({
      valid: false,
      discountInPaise: 0,
    });

    // Email matches, but customerId is missing -> MUST reject (prevents ID bypass)
    await expect(
      couponService.validateCoupon('SORRY250', 50000, { customerEmail: 'asha@example.com' }),
    ).resolves.toMatchObject({
      valid: false,
      discountInPaise: 0,
    });

    // Email matches, but wrong customerId -> MUST reject
    await expect(
      couponService.validateCoupon('SORRY250', 50000, {
        customerId: '22222222-2222-4222-8222-222222222222',
        customerEmail: 'asha@example.com',
      }),
    ).resolves.toMatchObject({
      valid: false,
      discountInPaise: 0,
    });

    // Wrong email with matching customerId -> MUST reject
    await expect(
      couponService.validateCoupon('SORRY250', 50000, {
        customerId,
        customerEmail: 'other@example.com',
      }),
    ).resolves.toMatchObject({
      valid: false,
      discountInPaise: 0,
    });

    // Both match -> accepted
    await expect(
      couponService.validateCoupon('SORRY250', 50000, {
        customerId,
        customerEmail: 'ASHA@example.com',
      }),
    ).resolves.toMatchObject({
      valid: true,
      code: 'SORRY250',
      discountInPaise: 25000,
    });

    // Email-only restriction when assignedCustomerId is not set
    state.coupon = activeCoupon({
      code: 'EMAILONLY',
      discountType: 'FLAT',
      value: 10000,
      assignedCustomerId: null,
      assignedCustomerEmail: 'asha@example.com',
    });
    await expect(
      couponService.validateCoupon('EMAILONLY', 50000, { customerEmail: 'ASHA@example.com' }),
    ).resolves.toMatchObject({ valid: true, discountInPaise: 10000 });
  });

  it('rejects SPECIFIC_COLLECTIONS and empty SPECIFIC_PRODUCTS coupons instead of treating them as unrestricted', async () => {
    state.coupon = activeCoupon({
      code: 'COL10',
      appliesTo: 'SPECIFIC_COLLECTIONS',
      applicableProductIds: [],
    });
    await expect(couponService.validateCoupon('COL10', 50000)).resolves.toMatchObject({
      valid: false,
      discountInPaise: 0,
    });

    state.coupon = activeCoupon({
      code: 'EMPTYPROD',
      appliesTo: 'SPECIFIC_PRODUCTS',
      applicableProductIds: [],
    });
    await expect(couponService.validateCoupon('EMPTYPROD', 50000)).resolves.toMatchObject({
      valid: false,
      discountInPaise: 0,
    });
  });

  it('uses integer truncation division for odd-paise percentage discounts', async () => {
    state.coupon = activeCoupon({ code: 'ODD10', discountType: 'PERCENTAGE', value: 10 });
    await expect(couponService.validateCoupon('ODD10', 250009)).resolves.toMatchObject({
      valid: true,
      discountInPaise: 25000,
    });
    await expect(couponService.validateCoupon('ODD10', 99)).resolves.toMatchObject({
      valid: true,
      discountInPaise: 9,
    });
  });

  it('enforces perCustomerLimit and SPECIFIC_PRODUCTS applicability when context is provided', async () => {
    state.coupon = activeCoupon({
      appliesTo: 'SPECIFIC_PRODUCTS',
      applicableProductIds: ['prod-1'],
      perCustomerLimit: 1,
    });

    await expect(
      couponService.validateCoupon('SAVE10', 50000, {
        customerEmail: 'asha@example.com',
        productIds: ['prod-2'],
      }),
    ).resolves.toMatchObject({ valid: false, discountInPaise: 0 });

    state.customerUsage = 1;
    await expect(
      couponService.validateCoupon('SAVE10', 50000, {
        customerEmail: 'asha@example.com',
        productIds: ['prod-1'],
      }),
    ).resolves.toMatchObject({ valid: false, discountInPaise: 0 });
  });

  it('never advertises customer-restricted, disabled, expired, or exhausted coupons in the announcement bar', async () => {
    state.promotions = [
      activeCoupon({
        code: 'SORRY250',
        assignedCustomerId: '11111111-1111-4111-8111-111111111111',
        assignedCustomerEmail: 'asha@example.com',
        showInHeader: true,
        showInExitIntent: true,
        autoApply: true,
        headerBannerText: 'Personal apology',
      }),
    ];
    state.settings.announcementCouponCode = 'EXPIRED10';
    state.coupon = activeCoupon({ code: 'EXPIRED10', expiresAt: '2020-01-01T00:00:00.000Z' });

    const storefront = await couponService.getStorefrontSettings();
    expect(storefront.header.code).toBeUndefined();
    expect(storefront.header.isActive).toBe(false);
    expect(storefront.exitOffer).toBeNull();
    expect(storefront.automaticCodes).toEqual([]);
  });

  it('advertises an active public coupon linked in announcement bar settings', async () => {
    state.settings.announcementText = 'Weekend Archive Sale — 15% off!';
    state.settings.announcementCouponCode = 'WEEKEND15';
    state.coupon = activeCoupon({ code: 'WEEKEND15', discountType: 'PERCENTAGE', value: 15 });

    const storefront = await couponService.getStorefrontSettings();
    expect(storefront.header).toMatchObject({
      text: 'Weekend Archive Sale — 15% off!',
      code: 'WEEKEND15',
      ctaLabel: 'Copy Code',
      isActive: true,
    });
  });
});
