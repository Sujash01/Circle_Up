import { Router } from 'express';
import { reviewController } from '../controllers/review.controller.js';
import { cacheCatalogReads, noStoreCache } from '../middleware/cacheControl.js';
import { userSubmissionRateLimiter } from '../middleware/rateLimiter.js';

export const reviewRouter = Router();

reviewRouter.get('/', cacheCatalogReads, reviewController.list);
reviewRouter.post('/', userSubmissionRateLimiter, noStoreCache, reviewController.create);
