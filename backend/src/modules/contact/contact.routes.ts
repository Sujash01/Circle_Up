import { Router, type Request, type Response, type NextFunction } from 'express';
import { createInquiryPayloadSchema } from '@circleup/shared';
import { sendCreated } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';
import { contactRateLimiter } from '../../middleware/rateLimiter.js';
import { inquiryService } from '../../services/inquiry.service.js';

export const contactRouter = Router();

contactRouter.post('/', contactRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createInquiryPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(
        'Contact submission is invalid.',
        'VALIDATION_ERROR',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || undefined,
          issue: issue.message,
        })),
      );
    }

    const inquiry = await inquiryService.create(parsed.data);
    return sendCreated(res, inquiry, 'Thank you! Your message has been received.');
  } catch (error) {
    next(error);
  }
});

