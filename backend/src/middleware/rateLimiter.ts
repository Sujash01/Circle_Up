import rateLimit from 'express-rate-limit';
import { TooManyRequestsError } from '../errors/AppError.js';

function createRateLimiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_req, _res, next) {
      next(new TooManyRequestsError(message));
    },
  });
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export const globalRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  300,
  'Too many API requests, please try again shortly',
);

export const customerAuthRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  10,
  'Too many authentication attempts, please wait 15 minutes',
);

export const adminAuthRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  5,
  'Too many admin login attempts, please wait 15 minutes',
);

export const checkoutRateLimiter = createRateLimiter(
  TEN_MINUTES_MS,
  5,
  'Too many checkout attempts, please wait before trying again',
);

