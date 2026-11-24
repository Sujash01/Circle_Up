import { Router, type Request, type Response, type NextFunction } from 'express';
import type { RazorpayAvailability } from '@circleup/shared';
import { z } from 'zod';
import { checkoutRateLimiter } from '../middleware/rateLimiter.js';
import { noStoreCache } from '../middleware/cacheControl.js';
import { optionalCustomerAuth } from '../middleware/customerAuth.js';
import { optionalAdminAuth } from '../middleware/adminAuth.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import { orderService } from '../modules/orders/order.service.js';
import { emailService } from '../services/email.service.js';
import { getSupabaseAdminClient, isSupabaseCheckoutConfigured, isSupabaseConfigured } from '../services/supabase.service.js';
import {
  cancelPendingRazorpayReservation,
  markOrderPaidViaRazorpay,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  fetchRazorpayPayment,
  isCapturedPaymentForOrder,
  validateCapturedPaymentForOrder,
  claimRazorpayWebhookEvent,
  finalizeRazorpayWebhookEvent,
  finalizeOrderRefundInDatabase,
  isRazorpayConfigurationAvailable,
} from '../services/razorpay.service.js';

export const paymentRouter = Router();

paymentRouter.get('/availability', noStoreCache, (_req, res) => {
  const availability: RazorpayAvailability = {
    available: isRazorpayConfigurationAvailable() && isSupabaseCheckoutConfigured(),
  };
  sendSuccess(res, availability);
});

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
 * Customer storefront verification: verifies ownership, signature, and server-side payment evidence.
 * Does NOT allow arbitrary admin sessions to bypass customer/guest ownership.
 */
paymentRouter.post(
  '/verify',
  checkoutRateLimiter,
  noStoreCache,
  optionalCustomerAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = verifyPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid payment verification payload.', 'VALIDATION_ERROR', parsed.error.issues);
      }

      const { orderNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

      // 1. Fetch internal order and assert customer or guest ownership
      const order = await orderService.getOrderByNumber(orderNumber);
      if (!order) {
        throw new NotFoundError(`Order ${orderNumber} not found`, 'ORDER_NOT_FOUND');
      }

      const isAuthedCustomer = Boolean(req.customer?.id && order.customerId === req.customer.id);
      const guestToken = req.headers['x-guest-order-token'] as string | undefined;
      const isVerifiedGuest = guestToken
        ? orderService.verifyGuestAccessToken(
          guestToken,
          (order.guestAccessTokenHash || order.guestAccessToken) as string | null | undefined,
          order.guestAccessExpiresAt as Date | null | undefined,
          order.orderNumber as string | null | undefined,
        )
        : false;

      if (!isAuthedCustomer && !isVerifiedGuest) {
        throw new ForbiddenError(
          'You are not authorized to verify payment for this order. Customer sign-in or valid guest token required.',
          'FORBIDDEN_ORDER_ACCESS',
        );
      }

      // 2. Cryptographic signature verification
      const isValid = verifyRazorpayPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!isValid) {
        throw new BadRequestError('Payment signature verification failed.', 'PAYMENT_SIGNATURE_INVALID');
      }

      // 3. Fetch server-side payment evidence directly from Razorpay
      const evidence = await fetchRazorpayPayment(razorpay_payment_id);
      if (!evidence) {
        throw new BadRequestError(
          'Payment record could not be confirmed with the payment provider.',
          'PAYMENT_PROVIDER_UNAVAILABLE',
        );
      }

      // 4. Validate evidence: captured status, provider order ID, exact amount in paise, and currency
      const evidenceCheck = validateCapturedPaymentForOrder(evidence, {
        providerOrderId: razorpay_order_id,
        internalOrderNumber: orderNumber,
        amountPaise: Number(order.totalAmount || 0),
      });

      if (!evidenceCheck.valid) {
        throw new BadRequestError(
          `Payment verification rejected: ${evidenceCheck.reason}`,
          'PAYMENT_VALIDATION_FAILED',
        );
      }

      // 5. Mark order as PAID in database using server-verified evidence
      const result = await markOrderPaidViaRazorpay({
        orderNumber,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        verifiedAmountPaise: evidence.amount,
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
        ).catch(() => { });

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
        ).catch(() => { });
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
        throw new ForbiddenError('Authorization required to cancel this reservation.', 'FORBIDDEN_ORDER_ACCESS');
      }

      const paymentMethod = String(order.paymentMethod || '').toUpperCase();
      const isOnlineOrder =
        paymentMethod === 'RAZORPAY' ||
        paymentMethod === 'ONLINE_UPI' ||
        Boolean(order.razorpayOrderId);

      if (isOnlineOrder) {
        // Modal dismissal / customer abandonment MUST NOT release reservation or restore stock
        if (isSupabaseConfigured()) {
          const client = getSupabaseAdminClient();
          const currentNotes = (order.notes as string) || '';
          const noteMarker = '[MODAL_DISMISSED: RESERVATION_PRESERVED]';
          if (!currentNotes.includes(noteMarker)) {
            const updatedNotes = currentNotes ? `${currentNotes} | ${noteMarker}` : noteMarker;
            await client.from('orders').update({ notes: updatedNotes }).eq('id', order.id);
          }
        }
        return sendSuccess(res, {
          orderNumber,
          cancelled: false,
          reservationHeld: true,
        }, { message: 'Online order reservation preserved. Stock was not released on modal dismissal.' });
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
 * Dedicated Razorpay webhook handler with transactional idempotency ledger.
 * Authenticates exclusively via webhook signing secret.
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

      if (!isValid) {
        throw new BadRequestError('Webhook signature verification failed.', 'WEBHOOK_SIGNATURE_INVALID');
      }

      const eventId =
        (req.headers['x-razorpay-event-id'] as string | undefined) ||
        (req.body?.event_id as string | undefined) ||
        (req.body?.id as string | undefined) ||
        `evt_${signature.slice(0, 32)}`;

      const eventType = (req.body?.event as string | undefined) || 'unknown';
      const payload = req.body?.payload;

      const paymentEntity = payload?.payment?.entity;
      const refundEntity = payload?.refund?.entity;
      const orderEntity = payload?.order?.entity;
      const paymentId = String(paymentEntity?.id || refundEntity?.payment_id || '');
      const internalOrderNumber =
        paymentEntity?.notes?.internalOrderNumber ||
        refundEntity?.notes?.internalOrderNumber ||
        orderEntity?.receipt ||
        paymentEntity?.description;

      // 1. Transactional idempotency claim with recoverable lease
      const claimStatus = await claimRazorpayWebhookEvent({
        eventId,
        eventType,
        orderNumber: typeof internalOrderNumber === 'string' ? internalOrderNumber : undefined,
        paymentId: paymentId || undefined,
        payload: req.body,
        leaseSeconds: 120,
      });

      if (claimStatus === 'ALREADY_PROCESSED') {
        return res.status(200).json({ status: 'ok', message: 'Event already processed' });
      }

      if (claimStatus === 'CONCURRENTLY_PROCESSING') {
        // Active lease held by another worker. Return 429 so gateway retries if active worker fails
        return res.status(429).json({
          status: 'concurrently_processing',
          message: 'Webhook event is currently being processed by another worker.',
        });
      }

      // 2. Process event safely with atomic order-and-event transaction
      try {
        if (eventType === 'payment.captured' || eventType === 'order.paid') {
          const razorpayOrderId = String(paymentEntity?.order_id || orderEntity?.id || '');
          let targetOrder = null;

          if (internalOrderNumber && typeof internalOrderNumber === 'string') {
            try {
              targetOrder = await orderService.getOrderByNumber(internalOrderNumber);
            } catch {
              targetOrder = null;
            }
          }

          if (!targetOrder && razorpayOrderId && isSupabaseConfigured()) {
            const client = getSupabaseAdminClient();
            const { data } = await client
              .from('orders')
              .select('*, order_items(*)')
              .eq('razorpay_order_id', razorpayOrderId)
              .maybeSingle();
            if (data) {
              targetOrder = data;
            }
          }

          if (!targetOrder) {
            // Unmatched payment event: store as UNMATCHED_ANOMALY without state mutation
            await finalizeRazorpayWebhookEvent(
              eventId,
              'UNMATCHED_ANOMALY',
              `No internal order found for orderNumber "${internalOrderNumber}" or providerOrderId "${razorpayOrderId}".`,
            );
            return res.status(200).json({ status: 'ok', message: 'Unmatched event recorded as anomaly' });
          }

          if (!paymentId) {
            throw new BadRequestError('Webhook missing payment identifier.', 'PAYMENT_IDENTIFIER_MISSING');
          }

          // Server-verified evidence fetch
          const evidence = await fetchRazorpayPayment(paymentId);
          if (!evidence) {
            throw new BadRequestError(
              'Payment record could not be confirmed with the payment provider.',
              'PAYMENT_PROVIDER_UNAVAILABLE',
            );
          }

          const resolvedOrderNumber = String(targetOrder.orderNumber || targetOrder.order_number || '');
          const check = isCapturedPaymentForOrder(evidence, {
            providerOrderId: razorpayOrderId || String(targetOrder.razorpay_order_id || ''),
            internalOrderNumber: resolvedOrderNumber,
            amountPaise: Number(targetOrder.totalAmount || targetOrder.total_amount || 0),
          });

          if (!check) {
            throw new BadRequestError(
              'Webhook payment evidence invalid: does not match order parameters.',
              'PAYMENT_VALIDATION_FAILED',
            );
          }

          // Atomic transition: updates order to PAID and webhook event to PROCESSED in same DB transaction
          await markOrderPaidViaRazorpay({
            orderNumber: resolvedOrderNumber,
            razorpayOrderId: razorpayOrderId || String(targetOrder.razorpay_order_id || ''),
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
            verifiedAmountPaise: evidence.amount,
            webhookEventId: eventId,
          });
        } else if (eventType === 'refund.processed') {
          const rzpRefundId = String(refundEntity?.id || '');
          const rzpPaymentId = String(refundEntity?.payment_id || paymentId || '');

          if (!rzpRefundId && !rzpPaymentId) {
            throw new BadRequestError('Refund webhook missing refund and payment identifiers.', 'REFUND_IDENTIFIER_MISSING');
          }

          if (!isSupabaseConfigured()) {
            throw new BadRequestError('Database is not configured.', 'DATABASE_UNAVAILABLE');
          }

          const client = getSupabaseAdminClient();

          // Match refund record by specific identifiers:
          // 1. razorpay_refund_id
          // 2. internal notes refund ID
          // 3. idempotency key
          // 4. razorpay_payment_id with matching pending status and matching amount
          interface MatchedRefundRecord {
            id: string;
            order_id: string;
            razorpay_payment_id?: string;
            amount_paise?: number;
            status?: string;
          }
          let refundRow: MatchedRefundRecord | null = null;

          if (rzpRefundId) {
            const { data } = await client
              .from('refunds')
              .select('id, order_id, razorpay_payment_id, amount_paise, status')
              .eq('razorpay_refund_id', rzpRefundId)
              .maybeSingle();
            if (data) refundRow = data as unknown as MatchedRefundRecord;
          }

          if (!refundRow && refundEntity?.notes?.internalRefundId) {
            const { data } = await client
              .from('refunds')
              .select('id, order_id, razorpay_payment_id, amount_paise, status')
              .eq('id', refundEntity.notes.internalRefundId)
              .maybeSingle();
            if (data) refundRow = data as unknown as MatchedRefundRecord;
          }

          if (!refundRow && refundEntity?.notes?.idempotencyKey) {
            const { data } = await client
              .from('refunds')
              .select('id, order_id, razorpay_payment_id, amount_paise, status')
              .eq('idempotency_key', refundEntity.notes.idempotencyKey)
              .maybeSingle();
            if (data) refundRow = data as unknown as MatchedRefundRecord;
          }

          if (!refundRow && rzpPaymentId) {
            const expectedAmountPaise = typeof refundEntity?.amount === 'number' ? refundEntity.amount : undefined;
            let query = client
              .from('refunds')
              .select('id, order_id, razorpay_payment_id, amount_paise, status')
              .eq('razorpay_payment_id', rzpPaymentId)
              .in('status', ['REQUESTED', 'PENDING', 'APPROVED']);

            if (expectedAmountPaise) {
              query = query.eq('amount_paise', expectedAmountPaise);
            }

            const { data } = await query
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data) refundRow = data as unknown as MatchedRefundRecord;
          }

          if (!refundRow) {
            // Unmatched refund: store as UNMATCHED_ANOMALY without state mutation
            await finalizeRazorpayWebhookEvent(
              eventId,
              'UNMATCHED_ANOMALY',
              `No pending internal refund record found for payment "${rzpPaymentId}" or refund "${rzpRefundId}".`,
            );
            return res.status(200).json({ status: 'ok', message: 'Unmatched refund recorded as anomaly' });
          }

          const resolvedRefund = refundRow as MatchedRefundRecord;

          // Verify matched refund belongs to valid order and payment record
          const { data: matchedPayment } = await client
            .from('payment_records')
            .select('id, order_id, payment_id, status')
            .eq('order_id', resolvedRefund.order_id)
            .eq('payment_id', rzpPaymentId)
            .maybeSingle();

          if (!matchedPayment) {
            await finalizeRazorpayWebhookEvent(
              eventId,
              'UNMATCHED_ANOMALY',
              `Refund "${resolvedRefund.id}" order_id "${resolvedRefund.order_id}" does not match payment record for "${rzpPaymentId}".`,
            );
            return res.status(200).json({ status: 'ok', message: 'Mismatched refund payment record recorded as anomaly' });
          }

          // Authoritative finalization via hardened RPC storefront_finalize_order_refund
          await finalizeOrderRefundInDatabase({
            refundId: resolvedRefund.id,
            providerStatus: 'PROCESSED',
            razorpayRefundId: rzpRefundId || undefined,
            webhookEventId: eventId,
          });
        } else {
          // Unsupported / unrecognized event type: finalize without mutating order or inventory state
          await finalizeRazorpayWebhookEvent(
            eventId,
            'UNMATCHED_ANOMALY',
            `Ignored unsupported webhook event type "${eventType}".`,
          );
        }

        return res.status(200).json({ status: 'ok' });
      } catch (procErr: unknown) {
        // Record failure so event can be retried by Razorpay
        const errMsg = procErr instanceof Error ? procErr.message : String(procErr);
        await finalizeRazorpayWebhookEvent(eventId, 'FAILED', errMsg).catch(() => { });
        throw procErr;
      }
    } catch (error) {
      next(error);
    }
  },
);
