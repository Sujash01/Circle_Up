import type { Request, Response, NextFunction } from 'express';
import { adminOrderService } from '../../services/adminOrder.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';
import { z } from 'zod';
import { adminCancelOrderSchema, orderStatusSchema } from '@circleup/shared';
import { adminAuthService } from '../../services/adminAuth.service.js';

const orderReferenceSchema = z.string().trim().min(8).max(100).regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|ORD-[A-Z0-9-]{8,80})$/i);
const updateOrderStatusSchema = z.object({ status: orderStatusSchema }).strict();
const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.union([z.literal('ALL'), orderStatusSchema]).optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

export const adminOrderController = {
  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const reference = orderReferenceSchema.safeParse(req.params.id);
      const parsed = adminCancelOrderSchema.safeParse(req.body);
      if (!reference.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message || 'Request is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Owner authentication is required.', 'UNAUTHORIZED');
      await adminAuthService.reauthenticateOwner(actor, parsed.data.password);
      return sendSuccess(res, await adminOrderService.cancelOrder(reference.data, parsed.data.reason, actor, req.ip));
    } catch (error) {
      next(error);
    }
  },
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
        utrNumber: z.string().min(6).max(100),
        paymentProofUrl: z.string().url().max(1000).optional().or(z.string().max(1000).optional()),
        confirmedAmountPaise: z.number().int().positive(),
      }).safeParse(req.body);
      if (!body.success) throw new BadRequestError('Payment verification request is invalid: confirmedAmountPaise and utrNumber (min 6 chars) are mandatory.', 'VALIDATION_ERROR');
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
          confirmedAmountPaise: body.data.confirmedAmountPaise,
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
        idempotencyKey: z.string().min(10).max(100).optional(),
        settlementReference: z.string().max(100).optional(),
      });
      const parsedBody = refundSchema.safeParse(req.body);
      if (!parsedBody.success) throw new BadRequestError('Refund request is invalid.', 'VALIDATION_ERROR');
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Owner authentication is required.', 'UNAUTHORIZED');

      const headerIdempotency = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
      const idempotencyKey = parsedBody.data.idempotencyKey || headerIdempotency;

      const result = await adminOrderService.processRefund(
        parsedRef.data,
        parsedBody.data.amountPaise,
        parsedBody.data.reason,
        parsedBody.data.routingAction,
        actor,
        {
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
          userAgent: req.get('user-agent'),
        },
        {
          idempotencyKey,
          settlementReference: parsedBody.data.settlementReference,
        }
      );
      return sendSuccess(res, result, { message: 'Order refund processed successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async recordReturnInspection(req: Request, res: Response, next: NextFunction) {
    try {
      const returnInspectionSchema = z.object({
        items: z.array(z.object({
          orderItemId: z.string().uuid(),
          quantity: z.number().int().positive(),
          routingAction: z.enum(['RESTOCK', 'DRY_CLEAN', 'ALTERATION', 'DISCARD']),
        })).min(1),
        trackingNumber: z.string().max(100).optional(),
        inspectionStatus: z.enum(['PASSED', 'FAILED', 'CONDITIONAL']),
        inspectionNotes: z.string().max(1000).optional(),
        idempotencyKey: z.string().min(10).max(100).optional(),
      });
      const parsedBody = returnInspectionSchema.safeParse(req.body);
      if (!parsedBody.success) throw new BadRequestError('Return inspection request is invalid.', 'VALIDATION_ERROR');
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Admin authentication is required.', 'UNAUTHORIZED');

      const headerIdempotency = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
      const idempotencyKey = parsedBody.data.idempotencyKey || headerIdempotency;
      if (!idempotencyKey || idempotencyKey.trim().length < 10) {
        throw new BadRequestError('A valid idempotency key (>= 10 chars) is required.', 'VALIDATION_ERROR');
      }

      const result = await adminOrderService.recordReturnInspection(
        parsedRef.data,
        {
          items: parsedBody.data.items,
          trackingNumber: parsedBody.data.trackingNumber,
          inspectionStatus: parsedBody.data.inspectionStatus,
          inspectionNotes: parsedBody.data.inspectionNotes,
          idempotencyKey,
        },
        actor,
        {
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, result, { message: 'Physical return inspection recorded successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async authorizeReservationRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const releaseSchema = z.object({
        reason: z.string().trim().min(10).max(1000),
        password: adminCancelOrderSchema.shape.password,
        cancellationProof: z.record(z.unknown()).optional(),
      }).strict();
      const parsedBody = releaseSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new BadRequestError('Reservation release request is invalid: reason (>= 10 chars) is required.', 'VALIDATION_ERROR');
      }
      const parsedRef = orderReferenceSchema.safeParse(String(req.params.id || ''));
      if (!parsedRef.success) throw new BadRequestError('Order reference is invalid.', 'VALIDATION_ERROR');
      const actor = req.adminUser;
      if (!actor) throw new BadRequestError('Owner authentication is required.', 'UNAUTHORIZED');

      await adminAuthService.reauthenticateOwner(actor, parsedBody.data.password);
      const result = await adminOrderService.authorizeReservationRelease(
        parsedRef.data,
        {
          reason: parsedBody.data.reason,
          cancellationProof: parsedBody.data.cancellationProof,
        },
        actor,
        {
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, result, { message: 'Reservation released and inventory restored by authorized owner.' });
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

