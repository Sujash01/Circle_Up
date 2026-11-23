import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adminInquiryService } from '../../services/adminInquiry.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';

const inquiryStatusSchema = z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

export const adminInquiryController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await adminInquiryService.listInquiries({
        page: req.query.page,
        limit: req.query.limit,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });
      return sendSuccess(res, result.inquiries, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || '');
      if (!id) throw new BadRequestError('Inquiry ID is required.', 'VALIDATION_ERROR');
      const item = await adminInquiryService.getInquiry(id);
      return sendSuccess(res, item);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || '');
      if (!id) throw new BadRequestError('Inquiry ID is required.', 'VALIDATION_ERROR');

      const updateSchema = z.object({
        status: inquiryStatusSchema.optional(),
        notes: z.string().max(2000).optional(),
        reply: z.string().max(4000).optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError('Inquiry update payload is invalid.', 'VALIDATION_ERROR');

      const updated = await adminInquiryService.updateInquiry(id, parsed.data);
      return sendSuccess(res, updated, { message: 'Inquiry updated successfully.' });
    } catch (error) {
      next(error);
    }
  },
};
