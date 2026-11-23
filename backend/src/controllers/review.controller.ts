import type { Request, Response, NextFunction } from 'express';
import { reviewService } from '../services/review.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

export const reviewController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const reviews = await reviewService.listApprovedReviews();
      return sendSuccess(res, reviews);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await reviewService.submitReview(req.body);
      return sendCreated(res, created, 'Review submitted successfully and is pending moderation');
    } catch (error) {
      next(error);
    }
  },
};
