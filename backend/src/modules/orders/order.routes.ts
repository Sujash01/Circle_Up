import { Router } from 'express';
import { orderController } from './order.controller.js';
import {
  checkoutRateLimiter,
  orderLookupRateLimiter,
  customerOrdersRateLimiter,
} from '../../middleware/rateLimiter.js';
import { noStoreCache } from '../../middleware/cacheControl.js';
import { requireAdminAuth, optionalAdminAuth } from '../../middleware/adminAuth.js';
import { optionalCustomerAuth, requireCustomerAuth } from '../../middleware/customerAuth.js';

export const orderRouter = Router();

// Place new order (supports guest checkout or authenticated customer)
orderRouter.post('/', checkoutRateLimiter, noStoreCache, optionalCustomerAuth, orderController.create);

// List all store orders (strictly requires valid admin authentication)
orderRouter.get('/', requireAdminAuth(), noStoreCache, orderController.list);

// List authenticated customer's own orders
orderRouter.get(
  '/my-orders',
  customerOrdersRateLimiter,
  requireCustomerAuth,
  noStoreCache,
  orderController.myOrders,
);

// Get order details by orderNumber (protected: requires admin auth, matching customer auth, or verified guest access token via header)
orderRouter.get(
  '/:orderNumber',
  orderLookupRateLimiter,
  noStoreCache,
  optionalAdminAuth,
  optionalCustomerAuth,
  orderController.getOne,
);
