import type { Request, Response, NextFunction } from 'express';
import { Rental } from '../../models/Rental.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';

export const adminRentalController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const rentals = await Rental.find().sort({ createdAt: -1 }).lean();
        return sendSuccess(res, rentals);
      }
      return sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const rental = await Rental.create(req.body);
        await auditService.record({
          actor: req.adminUser,
          action: 'RENTAL_CREATE',
          entity: 'Rental',
          entityId: String(rental._id),
          diff: req.body,
          req,
        });
        return sendSuccess(res, rental, { statusCode: 201 });
      }
      return sendSuccess(res, { id: 'temp-rental', ...req.body }, { statusCode: 201 });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (mongoose.connection.readyState === 1) {
        const updated = await Rental.findByIdAndUpdate(
          id,
          { $set: req.body },
          { new: true, runValidators: true },
        );
        await auditService.record({
          actor: req.adminUser,
          action: 'RENTAL_UPDATE',
          entity: 'Rental',
          entityId: id || 'unknown',
          diff: req.body,
          req,
        });
        return sendSuccess(res, updated);
      }
      return sendSuccess(res, { id, ...req.body });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (mongoose.connection.readyState === 1) {
        await Rental.findByIdAndDelete(id);
        await auditService.record({
          actor: req.adminUser,
          action: 'RENTAL_DELETE',
          entity: 'Rental',
          entityId: id || 'unknown',
          req,
        });
      }
      return sendSuccess(res, { deleted: true });
    } catch (error) {
      next(error);
    }
  },
};
