import type { Request, Response, NextFunction } from 'express';
import { couponAdminCreateSchema, couponAdminUpdateSchema } from '@circleup/shared';
import { couponRepository } from '../../repositories/coupon.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';

function parseInput(schema: typeof couponAdminCreateSchema | typeof couponAdminUpdateSchema, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError('Coupon details are invalid.', 'VALIDATION_ERROR', result.error.issues.map((issue) => ({
      field: issue.path.join('.'), message: issue.message,
    })));
  }
  return result.data;
}

export const adminCouponController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await couponRepository.list()); }
    catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseInput(couponAdminCreateSchema, req.body);
      const created = await couponRepository.create(input);
      await auditService.record({ actor: req.adminUser, action: 'COUPON_CREATE', entity: 'Coupon', entityId: created.id, diff: input, req });
      return sendCreated(res, created);
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const input = parseInput(couponAdminUpdateSchema, req.body);
      const updated = await couponRepository.update(id, input);
      await auditService.record({ actor: req.adminUser, action: 'COUPON_UPDATE', entity: 'Coupon', entityId: updated.id, diff: input, req });
      return sendSuccess(res, updated);
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await couponRepository.delete(id);
      await auditService.record({ actor: req.adminUser, action: 'COUPON_DELETE', entity: 'Coupon', entityId: id, req });
      return sendSuccess(res, { message: 'Coupon deleted successfully.' });
    } catch (error) { next(error); }
  },
};
