import type { Request, Response, NextFunction } from 'express';
import { SiteSettings } from '../../models/SiteSettings.js';
import { settingsRepository } from '../../repositories/settings.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';

export const adminSettingsController = {
  async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsRepository.getSettings();
      return sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const updated = await SiteSettings.findOneAndUpdate(
          {},
          { $set: req.body, $inc: { contentVersion: 1 } },
          { new: true, upsert: true },
        );

        await auditService.record({
          actor: req.adminUser,
          action: 'SETTINGS_UPDATE',
          entity: 'SiteSettings',
          entityId: 'global',
          diff: req.body,
          req,
        });

        return sendSuccess(res, updated);
      }

      return sendSuccess(res, { ...req.body, contentVersion: 2 });
    } catch (error) {
      next(error);
    }
  },
};
