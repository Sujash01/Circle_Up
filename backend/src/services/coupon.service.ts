import { couponRepository } from '../repositories/coupon.repository.js';
import { BadRequestError } from '../errors/AppError.js';
import type { CouponValidateResult } from '@circleup/shared';
import type { ClientSession } from 'mongoose';

export const couponService = {
  async validateCoupon(code: string, subtotalInPaise: number, session?: ClientSession): Promise<CouponValidateResult> {
    if (!code || !code.trim()) {
      throw new BadRequestError('Coupon code is required.', 'COUPON_REQUIRED');
    }

    const coupon = await couponRepository.findByCode(code, session);
    if (!coupon || !coupon.isActive) {
      return {
        valid: false,
        code: code.trim().toUpperCase(),
        discountInPaise: 0,
        message: 'Invalid or expired promotional code.',
      };
    }

    // Check expiry if set
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return {
        valid: false,
        code: coupon.code,
        discountInPaise: 0,
        message: 'This promo code has expired.',
      };
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return {
        valid: false,
        code: coupon.code,
        discountInPaise: 0,
        message: 'This promo code has reached its maximum usage limit.',
      };
    }

    // Check minimum order subtotal
    if (subtotalInPaise < coupon.minOrderAmount) {
      const minInRupees = Math.round(coupon.minOrderAmount / 100);
      return {
        valid: false,
        code: coupon.code,
        discountInPaise: 0,
        message: `Code ${coupon.code} requires a minimum bag value of ₹${minInRupees.toLocaleString('en-IN')}.`,
      };
    }

    let discountInPaise = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discountInPaise = Math.round((subtotalInPaise * coupon.value) / 100);
      if (coupon.maxDiscountAmount && discountInPaise > coupon.maxDiscountAmount) {
        discountInPaise = coupon.maxDiscountAmount;
      }
    } else {
      discountInPaise = Math.min(coupon.value, subtotalInPaise);
    }

    return {
      valid: true,
      code: coupon.code,
      discountInPaise,
      message: `Promo code ${coupon.code} applied successfully!`,
    };
  },
};

