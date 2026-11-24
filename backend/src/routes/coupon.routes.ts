import { Router } from 'express';
import { couponController } from '../controllers/coupon.controller.js';
import { couponRateLimiter } from '../middleware/rateLimiter.js';
import { noStoreCache } from '../middleware/cacheControl.js';

export const couponRouter = Router();

couponRouter.get('/promotions', noStoreCache, couponController.storefrontSettings);
couponRouter.post('/validate', couponRateLimiter, noStoreCache, couponController.validate);

