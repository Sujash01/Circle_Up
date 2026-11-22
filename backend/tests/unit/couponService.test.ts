import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ coupon: null as Record<string, unknown> | null, failure: null as Error | null }));
vi.mock('../../src/repositories/coupon.repository.js', () => ({
  couponRepository: {
    findByCode: async () => {
      if (state.failure) throw state.failure;
      return state.coupon;
    },
  },
}));

import { couponService } from '../../src/services/coupon.service.js';

const activeCoupon = (values: Record<string, unknown> = {}) => ({
  code: 'SAVE10', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 0,
  maxDiscountAmount: undefined, usageCount: 0, usageLimit: undefined, isActive: true,
  startsAt: undefined, expiresAt: undefined, ...values,
});

describe('Supabase-backed coupon validation rules', () => {
  beforeEach(() => { state.coupon = activeCoupon(); state.failure = null; });

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
});
