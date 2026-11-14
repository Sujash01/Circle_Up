import { Router } from 'express';
import { searchController } from '../controllers/search.controller.js';
import { searchRateLimiter } from '../middleware/rateLimiter.js';
import { cacheCatalogReads } from '../middleware/cacheControl.js';

export const searchRouter = Router();

searchRouter.get('/', searchRateLimiter, cacheCatalogReads, searchController.search);

