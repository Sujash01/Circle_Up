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
import { createOrderPayloadSchema } from '@circleup/shared';
import { BadRequestError } from '../../errors/AppError.js';

export const orderRouter = Router();

// Place new order (supports guest checkout or authenticated customer)
orderRouter.post('/', checkoutRateLimiter, noStoreCache, optionalCustomerAuth, (req, _res, next) => {
  const parsed = createOrderPayloadSchema.safeParse(req.body);
  if (!parsed.success) return next(new BadRequestError('Checkout request is invalid.', 'VALIDATION_ERROR', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message }))));
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return next(new BadRequestError('A valid Idempotency-Key header is required.', 'IDEMPOTENCY_KEY_REQUIRED'));
  }
  req.body = { ...parsed.data, idempotencyKey };
  next();
}, orderController.create);

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
