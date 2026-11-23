import { Router, type Request } from 'express';
import { z } from 'zod';
import { marketingService } from '../services/marketing.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { BadRequestError } from '../errors/AppError.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

export const marketingRouter = Router();

const marketingLimiter = createRateLimiter(
  15 * 60 * 1000,
  10,
  'Too many marketing requests, please try again later',
  (req: Request) => `mkt:${req.ip || 'unknown'}`
);

marketingRouter.post('/newsletter', marketingLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().max(100).optional(),
      source: z.string().max(50).optional(),
      consent: z.boolean().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Subscription request is invalid.', 'VALIDATION_ERROR');

    const result = await marketingService.subscribeNewsletter({
      ...parsed.data,
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
    });
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
});

marketingRouter.post('/unsubscribe', marketingLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Email address is invalid.', 'VALIDATION_ERROR');

    const result = await marketingService.unsubscribeNewsletter(parsed.data.email);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
});
