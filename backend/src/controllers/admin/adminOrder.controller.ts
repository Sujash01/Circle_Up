import type { Request, Response, NextFunction } from 'express';
import { adminOrderService } from '../../services/adminOrder.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';
import { z } from 'zod';

const orderReferenceSchema = z.string().trim().min(8).max(100).regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|ORD-[A-Z0-9-]{8,80})$/i);
const orderStatusSchema = z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']) }).strict();
const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['ALL', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

export const adminOrderController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedQuery = orderListQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) throw new BadRequestError('Order filters are invalid.', 'VALIDATION_ERROR');
      const result = await adminOrderService.listOrders({
        ...parsedQuery.data,
      });
      return sendSuccess(res, result.orders, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      const parsedBody = orderStatusSchema.safeParse(req.body);
      if (!parsedRef.success || !parsedBody.success) throw new BadRequestError('Order status request is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Admin authentication is required.', 'UNAUTHORIZED');
      const order = await adminOrderService.updateOrderStatus(parsedRef.data, parsedBody.data.status, actor, {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.get('user-agent'),
      });

      return sendSuccess(res, order, { message: `Order status updated to ${parsedBody.data.status}.` });
    } catch (error) {
      next(error);
    }
  },

  async markPaymentReceived(req: Request, res: Response, next: NextFunction) {
    try {
      const body = z.object({ paymentStatus: z.literal('PAID') }).strict().safeParse(req.body);
      if (!body.success) throw new BadRequestError('Payment verification request is invalid.', 'VALIDATION_ERROR');
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const id = parsedRef.data;
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Owner authentication is required.', 'UNAUTHORIZED');
      const order = await adminOrderService.markPaymentReceived(id, actor, {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.get('user-agent'),
      });
      return sendSuccess(res, order, { message: 'Payment receipt recorded by an authorized owner.' });
    } catch (error) {
      next(error);
    }
  },
};

