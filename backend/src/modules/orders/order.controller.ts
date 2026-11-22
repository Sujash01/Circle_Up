import type { Request, Response, NextFunction } from 'express';
import { orderService } from './order.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { ForbiddenError, UnauthorizedError } from '../../errors/AppError.js';

function withoutGuestCredential(order: Record<string, unknown>): Record<string, unknown> {
  const { guestAccessToken: _token, guestAccessTokenHash: _hash, ...safeOrder } = order;
  return safeOrder;
}

export const orderController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      // Security: derive customer identity EXCLUSIVELY from verified JWT subject;
      // unauthenticated guests MUST NEVER supply or override customerId
      const customerId = req.customer ? req.customer.id : undefined;

      // Strip any client-supplied customerId or token overrides from request body
      const { customerId: _ignoredCustId, ...cleanBody } = req.body;

      const order = await orderService.createOrder({
        ...cleanBody,
        customerId,
      });
      return sendCreated(res, order, 'Order confirmed successfully');
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await orderService.listOrders({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status as string,
        phone: req.query.phone as string,
      });
      return sendSuccess(res, result.orders.map((order) => withoutGuestCredential(order)), { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async myOrders(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.customer?.id) {
        throw new UnauthorizedError('Authentication required to view your orders.', 'UNAUTHORIZED');
      }
      const result = await orderService.listCustomerOrders(req.customer.id, {
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendSuccess(res, result.orders.map((order) => withoutGuestCredential(order)), { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const orderNumber = String(req.params.orderNumber || '');
      const order = await orderService.getOrderByNumber(orderNumber);
      const orderRecord = order as {
        customerId?: string | null;
        guestAccessTokenHash?: string | null;
        guestAccessToken?: string | null;
        guestAccessExpiresAt?: Date | null;
      };

      // 1. Legitimate admin access: allow if caller has valid admin session
      if (req.adminUser) {
        return sendSuccess(res, withoutGuestCredential(orderRecord));
      }

      // 2. Authenticated customer access: check verified Supabase customer ID
      if (req.customer) {
        if (orderRecord.customerId && orderRecord.customerId === req.customer.id) {
          return sendSuccess(res, withoutGuestCredential(orderRecord));
        }
        throw new ForbiddenError(
          'You are not authorized to view this order.',
          'FORBIDDEN_ORDER_ACCESS',
        );
      }

      // 3. Guest checkout access: accept exclusively via x-guest-order-token header;
      // query-string token authentication is strictly rejected to prevent URL/history leakage
      const providedToken = req.headers['x-guest-order-token'] as string | undefined;

      if (
        providedToken &&
        orderService.verifyGuestAccessToken(
          providedToken,
          (orderRecord.guestAccessTokenHash || orderRecord.guestAccessToken) as string | null | undefined,
          orderRecord.guestAccessExpiresAt as Date | null | undefined,
        )
      ) {
        return sendSuccess(res, withoutGuestCredential(orderRecord));
      }

      // 4. In all other cases: never treat email, phone, or query params as proof of ownership
      throw new ForbiddenError(
        'You are not authorized to view this order. Valid customer authentication or x-guest-order-token header required.',
        'FORBIDDEN_ORDER_ACCESS',
      );
    } catch (error) {
      next(error);
    }
  },
};
