import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { orderService } from '../modules/orders/order.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { noStoreCache } from '../middleware/cacheControl.js';

export const cronRouter = Router();

export function requireCronAuth(req: Request, _res: Response, next: NextFunction) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return next(new UnauthorizedError('Cron endpoint is not configured on this server.', 'CRON_NOT_CONFIGURED'));
  }

  const authHeader = req.headers.authorization;
  const headerSecret = (req.headers['x-cron-secret'] as string | undefined) ||
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

  if (!headerSecret) {
    return next(new UnauthorizedError('Valid cron authorization secret is required.', 'UNAUTHORIZED'));
  }

  const bufProvided = Buffer.from(headerSecret.trim());
  const bufExpected = Buffer.from(secret.trim());

  if (bufProvided.length !== bufExpected.length || !crypto.timingSafeEqual(bufProvided, bufExpected)) {
    return next(new UnauthorizedError('Invalid cron secret.', 'UNAUTHORIZED'));
  }

  next();
}

/**
 * Scheduled Cron: Expire Stale Order Stock Reservations (Resolves P0-7)
 * Automatically cancels unpaid/pending orders older than RESERVATION_EXPIRY_HOURS
 * and restores inventory to active stock.
 */
cronRouter.post('/expire-reservations', noStoreCache, requireCronAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hours = req.body?.expiryHours ? Number(req.body.expiryHours) : env.RESERVATION_EXPIRY_HOURS;
    const result = await orderService.expireStaleReservations(hours);
    return sendSuccess(res, result, { message: 'Expired reservations processed successfully' });
  } catch (error) {
    next(error);
  }
});

cronRouter.post('/release-expired-holds', noStoreCache, requireCronAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hours = req.body?.expiryHours ? Number(req.body.expiryHours) : env.RESERVATION_EXPIRY_HOURS;
    const result = await orderService.expireStaleReservations(hours);
    return sendSuccess(res, result, { message: 'Expired holds released successfully' });
  } catch (error) {
    next(error);
  }
});
