import { Router } from 'express';
import { orderController } from './order.controller.js';
import { checkoutRateLimiter } from '../../middleware/rateLimiter.js';
import { noStoreCache } from '../../middleware/cacheControl.js';

export const orderRouter = Router();

// Place new order
orderRouter.post('/', checkoutRateLimiter, noStoreCache, orderController.create);

// List orders
orderRouter.get('/', noStoreCache, orderController.list);

// Get order details by orderNumber
orderRouter.get('/:orderNumber', noStoreCache, orderController.getOne);

