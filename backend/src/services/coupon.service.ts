import { couponRepository } from '../repositories/coupon.repository.js';
import { BadRequestError } from '../errors/AppError.js';
import type { CouponValidateResult } from '@circleup/shared';

const invalid = (code: string, message = 'Invalid or expired promotional code.'): CouponValidateResult => ({
  valid: false, code: code.trim().toUpperCase(), discountInPaise: 0, message,
});

export const couponService = {
  async validateCoupon(code: string, subtotalInPaise: number): Promise<CouponValidateResult> {
    if (!code || !code.trim()) throw new BadRequestError('Coupon code is required.', 'COUPON_REQUIRED');
    const coupon = await couponRepository.findByCode(code);
    if (!coupon || !coupon.isActive) return invalid(code);
    if (coupon.discountType !== 'PERCENTAGE' && coupon.discountType !== 'FLAT') {
      return invalid(code, `Promo code discount type "${coupon.discountType}" is not supported at checkout.`);
    }
    const now = Date.now();
    if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return invalid(code, 'This promo code is not yet active.');
    if (coupon.expiresAt && Date.parse(coupon.expiresAt) < now) return invalid(code, 'This promo code has expired.');
    if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
      return invalid(code, 'This promo code has reached its maximum usage limit.');
    }
    if (subtotalInPaise < coupon.minOrderAmount) {
      const minInRupees = Math.round(coupon.minOrderAmount / 100);
      return invalid(code, `Code ${coupon.code} requires a minimum bag value of ₹${minInRupees.toLocaleString('en-IN')}.`);
    }

    let discountInPaise = coupon.discountType === 'PERCENTAGE'
      ? Math.trunc((subtotalInPaise * coupon.value) / 100)
      : Math.min(coupon.value, subtotalInPaise);
    if (coupon.discountType === 'PERCENTAGE' && coupon.maxDiscountAmount !== undefined) {
      discountInPaise = Math.min(discountInPaise, coupon.maxDiscountAmount);
    }
    discountInPaise = Math.min(discountInPaise, subtotalInPaise);
    return { valid: true, code: coupon.code, discountInPaise, message: `Promo code ${coupon.code} applied successfully!` };
  },
};
