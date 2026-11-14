import type { Request, Response, NextFunction } from 'express';
import { Coupon } from '../../models/Coupon.js';
import { settingsRepository } from '../../repositories/settings.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { NotFoundError } from '../../errors/AppError.js';
import mongoose from 'mongoose';

export const adminCouponController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
        return sendSuccess(res, coupons);
      }
      return sendSuccess(res, [
        { code: 'THRIFT10', discountType: 'PERCENTAGE', discountValue: 10, isActive: true },
        { code: 'CIRCLE20', discountType: 'PERCENTAGE', discountValue: 20, isActive: true },
      ]);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const coupon = await Coupon.create(req.body);
        await settingsRepository.bumpVersion();
        await auditService.record({
          actor: req.adminUser,
          action: 'COUPON_CREATE',
          entity: 'Coupon',
          entityId: String(coupon._id),
          diff: req.body,
          req,
        });
        return sendCreated(res, coupon);
      }
      return sendCreated(res, { id: 'mock-coupon', ...req.body });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      if (mongoose.connection.readyState === 1) {
        const coupon = await Coupon.findByIdAndUpdate(id, { $set: req.body }, { new: true });
        if (!coupon) throw new NotFoundError('Coupon not found', 'COUPON_NOT_FOUND');
        await settingsRepository.bumpVersion();
        await auditService.record({
          actor: req.adminUser,
          action: 'COUPON_UPDATE',
          entity: 'Coupon',
          entityId: id,
          diff: req.body,
          req,
        });
        return sendSuccess(res, coupon);
      }
      return sendSuccess(res, { id, ...req.body });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      if (mongoose.connection.readyState === 1) {
        await Coupon.findByIdAndDelete(id);
        await settingsRepository.bumpVersion();
        await auditService.record({
          actor: req.adminUser,
          action: 'COUPON_DELETE',
          entity: 'Coupon',
          entityId: id,
          req,
        });
      }
      return sendSuccess(res, { message: 'Coupon deleted successfully.' });
    } catch (error) {
      next(error);
    }
  },
};
