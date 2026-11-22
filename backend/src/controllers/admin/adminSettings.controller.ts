import type { Request, Response, NextFunction } from 'express';
import { siteSettingsUpdateSchema } from '@circleup/shared';
import { BadRequestError } from '../../errors/AppError.js';
import { settingsRepository } from '../../repositories/settings.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const adminSettingsController = {
  async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsRepository.getSettings();
      return sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  },

  async getActivity(_req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await auditService.list();
      return sendSuccess(res, logs);
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = siteSettingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(
          'Site settings are invalid.',
          'VALIDATION_ERROR',
          parsed.error.issues.map((issue) => ({
            field: issue.path.join('.') || undefined,
            issue: issue.message,
          })),
        );
      }

      const updated = await settingsRepository.updateSettings(parsed.data);

      await auditService.record({
        actor: req.adminUser,
        action: 'SETTINGS_UPDATE',
        entity: 'SiteSettings',
        entityId: 'default',
        diff: parsed.data,
        req,
      });

      return sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  },
};
