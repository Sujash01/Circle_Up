import { Router } from 'express';
import { communityController } from '../controllers/community.controller.js';
import { cacheCatalogReads, noStoreCache } from '../middleware/cacheControl.js';
import { userSubmissionRateLimiter } from '../middleware/rateLimiter.js';

export const communityRouter = Router();

communityRouter.get('/', cacheCatalogReads, communityController.list);
communityRouter.post('/', userSubmissionRateLimiter, noStoreCache, communityController.create);
