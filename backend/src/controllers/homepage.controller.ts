import type { Request, Response, NextFunction } from 'express';
import { homepageService } from '../services/homepage.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const homepageController = {
  async getHomepage(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await homepageService.getHomepagePayload();
      return sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  },
};

