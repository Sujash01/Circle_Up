import type { Request, Response, NextFunction } from 'express';
import { communityService } from '../services/community.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

export const communityController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const posts = await communityService.listApprovedPosts();
      return sendSuccess(res, posts);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const post = await communityService.submitPost(req.body);
      return sendCreated(res, post, 'Look submitted successfully and is pending community moderation');
    } catch (error) {
      next(error);
    }
  },
};
