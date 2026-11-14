import type { Request, Response, NextFunction } from 'express';
import { couponService } from '../services/coupon.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { couponValidatePayloadSchema } from '@circleup/shared';

export const couponController = {
  async validate(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = couponValidatePayloadSchema.parse(req.body);
      const result = await couponService.validateCoupon(parsed.code, parsed.subtotalInPaise);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
