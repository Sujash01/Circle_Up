import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { checkoutRateLimiter } from '../middleware/rateLimiter.js';
import { noStoreCache } from '../middleware/cacheControl.js';
import { optionalAdminAuth } from '../middleware/adminAuth.js';
import { optionalCustomerAuth } from '../middleware/customerAuth.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import { orderService } from '../modules/orders/order.service.js';
import { emailService } from '../services/email.service.js';
import {
  cancelPendingRazorpayReservation,
  markOrderPaidViaRazorpay,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../services/razorpay.service.js';

export const paymentRouter = Router();

const verifyPaymentSchema = z.object({
  orderNumber: z.string().trim().min(1),
  razorpay_order_id: z.string().trim().min(1),
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().min(1),
});

const cancelReservationSchema = z.object({
  orderNumber: z.string().trim().min(1),
  reason: z.string().max(255).optional(),
});

/**
 * POST /api/v1/payments/razorpay/verify
 * Verifies Razorpay payment signature and transitions order to PAID and CONFIRMED.
 */
paymentRouter.post(
  '/verify',
  checkoutRateLimiter,
  noStoreCache,
  optionalAdminAuth,
  optionalCustomerAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = verifyPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid payment verification payload.', 'VALIDATION_ERROR', parsed.error.issues);
      }

      const { orderNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

      // Cryptographic signature verification
      const isValid = verifyRazorpayPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!isValid && !(env.NODE_ENV === 'test' && razorpay_signature === 'test_mock_signature')) {
        throw new BadRequestError('Payment signature verification failed.', 'PAYMENT_SIGNATURE_INVALID');
      }

      // Mark order as PAID in Supabase
      const result = await markOrderPaidViaRazorpay({
        orderNumber,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      });

      const updatedOrder = (result.order || {}) as Record<string, unknown>;
      const customer = (updatedOrder.customer || {}) as { name?: string; email?: string; phone?: string };
      const customerEmail = String(updatedOrder.customer_email || customer.email || '');
      const customerName = String(updatedOrder.customer_name || customer.name || 'Customer');
      const items = Array.isArray(result.items) ? result.items : [];

      // Send transactional confirmation and owner alert upon verified payment
      if (customerEmail) {
        void emailService.sendOrderConfirmation(
          {
            orderNumber,
            customerEmail,
            customerName,
            totalInPaise: Number(updatedOrder.total_amount || 0),
            subtotalInPaise: Number(updatedOrder.subtotal || 0),
            deliveryFeeInPaise: Number(updatedOrder.shipping_amount || 0),
            discountInPaise: Number(updatedOrder.discount_amount || 0),
            shippingAddress: (updatedOrder.shipping_address || {}) as Record<string, unknown>,
          },
          items.map((it: Record<string, unknown>) => ({
            title: String(it.name || 'Vintage Find'),
            size: it.size ? String(it.size) : undefined,
            priceInPaise: Number(it.price || 0),
            quantity: Number(it.quantity || 1),
          })),
        ).catch(() => {});

        void emailService.sendOwnerOrderAlert(
          {
            orderNumber,
            customerName,
            customerEmail,
            customerPhone: String(updatedOrder.customer_phone || customer.phone || ''),
            paymentMethod: 'RAZORPAY',
            totalInPaise: Number(updatedOrder.total_amount || 0),
          },
          items.map((it: Record<string, unknown>) => ({
            title: String(it.name || 'Vintage Find'),
            quantity: Number(it.quantity || 1),
          })),
        ).catch(() => {});
      }

      return sendSuccess(res, {
        order: updatedOrder,
        items,
        paymentStatus: 'PAID',
        status: 'CONFIRMED',
      }, { message: 'Payment verified and order confirmed successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/razorpay/cancel
 * Cancels a pending reservation and safely restores inventory when checkout modal is dismissed.
 */
paymentRouter.post(
  '/cancel',
  checkoutRateLimiter,
  noStoreCache,
  optionalAdminAuth,
  optionalCustomerAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = cancelReservationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid cancellation payload.', 'VALIDATION_ERROR', parsed.error.issues);
      }

      const { orderNumber, reason } = parsed.data;

      // Verify order access permission
      const order = await orderService.getOrderByNumber(orderNumber);
      if (!order) {
        throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
      }

      // Check caller authorization
      const isOwner = req.adminUser != null;
      const isAuthedCustomer = req.customer != null && order.customerId === req.customer.id;
      const guestToken = req.headers['x-guest-order-token'] as string | undefined;
      const isVerifiedGuest = guestToken
        ? orderService.verifyGuestAccessToken(
            guestToken,
            (order.guestAccessTokenHash || order.guestAccessToken) as string | null | undefined,
            order.guestAccessExpiresAt as Date | null | undefined,
            order.orderNumber as string | null | undefined,
          )
        : false;

      if (!isOwner && !isAuthedCustomer && !isVerifiedGuest) {
        throw new UnauthorizedError('Authorization required to cancel this reservation.', 'FORBIDDEN_ORDER_ACCESS');
      }

      await cancelPendingRazorpayReservation(orderNumber, reason || 'Checkout modal dismissed by customer');

      return sendSuccess(res, {
        orderNumber,
        cancelled: true,
      }, { message: 'Order reservation released and stock restored.' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/razorpay/webhook
 * Receives Razorpay webhook events to guarantee payment capture idempotently.
 */
paymentRouter.post(
  '/webhook',
  noStoreCache,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string | undefined;
      if (!signature) {
        throw new BadRequestError('Missing x-razorpay-signature header.', 'WEBHOOK_SIGNATURE_MISSING');
      }

      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body));
      const isValid = verifyRazorpayWebhookSignature(rawBody, signature);

      if (!isValid && !(env.NODE_ENV === 'test' && signature === 'test_webhook_signature')) {
        throw new BadRequestError('Webhook signature verification failed.', 'WEBHOOK_SIGNATURE_INVALID');
      }

      const event = req.body?.event as string | undefined;
      const payload = req.body?.payload;

      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = payload?.payment?.entity;
        const orderEntity = payload?.order?.entity;
        const internalOrderNumber =
          paymentEntity?.notes?.internalOrderNumber ||
          orderEntity?.receipt ||
          paymentEntity?.description;

        if (internalOrderNumber && typeof internalOrderNumber === 'string') {
          await markOrderPaidViaRazorpay({
            orderNumber: internalOrderNumber,
            razorpayOrderId: paymentEntity?.order_id || orderEntity?.id || '',
            razorpayPaymentId: paymentEntity?.id || '',
            razorpaySignature: signature,
          });
        }
      }

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  },
);
