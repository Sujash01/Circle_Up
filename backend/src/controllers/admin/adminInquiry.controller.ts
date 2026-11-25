import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adminInquiryService } from '../../services/adminInquiry.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';

import { adminInquiryUpdateSchema, inquiryStatusSchema } from '@circleup/shared';

const inquiryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: inquiryStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
}).strict();

function parseInquiryId(value: unknown) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new BadRequestError('Inquiry ID is invalid.', 'VALIDATION_ERROR');
  return parsed.data;
}

export const adminInquiryController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = inquiryQuerySchema.safeParse(req.query);
      if (!query.success) throw new BadRequestError('Inquiry filters are invalid.', 'VALIDATION_ERROR');
      const result = await adminInquiryService.listInquiries(query.data);
      return sendSuccess(res, result.inquiries, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInquiryId(req.params.id);
      const item = await adminInquiryService.getInquiry(id);
      return sendSuccess(res, item);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInquiryId(req.params.id);
      const parsed = adminInquiryUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError('Inquiry update payload is invalid.', 'VALIDATION_ERROR');

      const updated = await adminInquiryService.updateInquiry(id, parsed.data);
      return sendSuccess(res, updated, { message: 'Inquiry updated successfully.' });
    } catch (error) {
      next(error);
    }
  },
};
