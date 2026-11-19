import mongoose, { type ClientSession } from 'mongoose';
import { Coupon, type ICouponDocument } from '../models/Coupon.js';
import { ConflictError } from '../errors/AppError.js';

export const couponRepository = {
  async findByCode(code: string, session?: ClientSession): Promise<ICouponDocument | null> {
    const upper = code.trim().toUpperCase();
    if (mongoose.connection.readyState !== 1) {
      // In-memory support for the two official launch coupons
      if (upper === 'THRIFT10') {
        return {
          code: 'THRIFT10',
          discountType: 'PERCENTAGE',
          value: 10,
          minOrderAmount: 100000, // ₹1,000 in paise
          isActive: true,
        } as unknown as ICouponDocument;
      }
      if (upper === 'CIRCLE20') {
        return {
          code: 'CIRCLE20',
          discountType: 'PERCENTAGE',
          value: 20,
          minOrderAmount: 150000, // ₹1,500 in paise
          isActive: true,
        } as unknown as ICouponDocument;
      }
      return null;
    }

    return Coupon.findOne({
      code: upper,
      isActive: true,
    }).session(session || null).lean() as Promise<ICouponDocument | null>;
  },

  async incrementUsage(code: string, session?: ClientSession): Promise<void> {
    if (mongoose.connection.readyState !== 1) throw new Error('Coupon database unavailable');
    const coupon = await Coupon.updateOne(
      { code: code.trim().toUpperCase(), isActive: true },
      { $inc: { usageCount: 1 } },
      { session },
    );
    if (coupon.modifiedCount !== 1) throw new ConflictError('Coupon could not be reserved. Please retry checkout.', 'COUPON_RESERVATION_FAILED');
  },
};

