import type { Request, Response, NextFunction } from 'express';
import { adminOrderService } from '../../services/adminOrder.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';
import { z } from 'zod';
import { orderStatusSchema } from '@circleup/shared';

const orderReferenceSchema = z.string().trim().min(8).max(100).regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|ORD-[A-Z0-9-]{8,80})$/i);
const updateOrderStatusSchema = z.object({ status: orderStatusSchema }).strict();
const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.union([z.literal('ALL'), orderStatusSchema]).optional(),
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
      const parsedBody = updateOrderStatusSchema.safeParse(req.body);
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
      const body = z.object({
        paymentStatus: z.literal('PAID'),
        utrNumber: z.string().max(100).optional(),
        paymentProofUrl: z.string().url().max(1000).optional().or(z.string().max(1000).optional()),
      }).safeParse(req.body);
      if (!body.success) throw new BadRequestError('Payment verification request is invalid.', 'VALIDATION_ERROR');
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const id = parsedRef.data;
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Owner authentication is required.', 'UNAUTHORIZED');
      const order = await adminOrderService.markPaymentReceived(
        id,
        actor,
        {
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
          userAgent: req.get('user-agent'),
        },
        {
          utrNumber: body.data.utrNumber,
          paymentProofUrl: body.data.paymentProofUrl,
        }
      );
      return sendSuccess(res, order, { message: 'Payment receipt recorded by an authorized owner.' });
    } catch (error) {
      next(error);
    }
  },

  async processRefund(req: Request, res: Response, next: NextFunction) {
    try {
      const refundSchema = z.object({
        amountPaise: z.number().int().positive(),
        reason: z.string().min(1).max(500),
        routingAction: z.enum(['RESTOCK', 'DRY_CLEAN', 'ALTERATION', 'DISCARD']).default('RESTOCK'),
      });
      const parsedBody = refundSchema.safeParse(req.body);
      if (!parsedBody.success) throw new BadRequestError('Refund request is invalid.', 'VALIDATION_ERROR');
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Owner authentication is required.', 'UNAUTHORIZED');

      const result = await adminOrderService.processRefund(
        parsedRef.data,
        parsedBody.data.amountPaise,
        parsedBody.data.reason,
        parsedBody.data.routingAction,
        actor,
        {
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, result, { message: 'Order refund processed successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async createFulfillment(req: Request, res: Response, next: NextFunction) {
    try {
      const fulfillmentSchema = z.object({
        trackingNumber: z.string().min(1).max(100),
        carrier: z.string().min(1).max(100),
        notes: z.string().max(500).optional(),
      });
      const parsedBody = fulfillmentSchema.safeParse(req.body);
      if (!parsedBody.success) throw new BadRequestError('Fulfillment request is invalid.', 'VALIDATION_ERROR');
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Admin authentication is required.', 'UNAUTHORIZED');

      const result = await adminOrderService.createFulfillment(
        parsedRef.data,
        parsedBody.data.trackingNumber,
        parsedBody.data.carrier,
        parsedBody.data.notes,
        actor,
        {
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, result, { message: 'Fulfillment recorded and order marked as shipped.' });
    } catch (error) {
      next(error);
    }
  },

  async getReconciliation(req: Request, res: Response, next: NextFunction) {
    try {
      const days = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : 30;
      const data = await adminOrderService.getDailyReconciliation(Number.isFinite(days) ? days : 30);
      return sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  },
};

