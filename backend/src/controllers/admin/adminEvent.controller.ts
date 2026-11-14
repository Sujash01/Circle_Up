import type { Request, Response, NextFunction } from 'express';
import { Event } from '../../models/Event.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';

export const adminEventController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const events = await Event.find().sort({ createdAt: -1 }).lean();
        return sendSuccess(res, events);
      }
      return sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const event = await Event.create(req.body);
        await auditService.record({
          actor: req.adminUser,
          action: 'EVENT_CREATE',
          entity: 'Event',
          entityId: String(event._id),
          diff: req.body,
          req,
        });
        return sendSuccess(res, event, { statusCode: 201 });
      }
      return sendSuccess(res, { id: 'temp-event', ...req.body }, { statusCode: 201 });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (mongoose.connection.readyState === 1) {
        const updated = await Event.findByIdAndUpdate(
          id,
          { $set: req.body },
          { new: true, runValidators: true },
        );
        await auditService.record({
          actor: req.adminUser,
          action: 'EVENT_UPDATE',
          entity: 'Event',
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
        await Event.findByIdAndDelete(id);
        await auditService.record({
          actor: req.adminUser,
          action: 'EVENT_DELETE',
          entity: 'Event',
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
