import type { Request, Response, NextFunction } from 'express';
import { rentalBookingStatusSchema, rentalCatalogItemSchema } from '@circleup/shared';
import { z } from 'zod';
import { BadRequestError } from '../../errors/AppError.js';
import { rentalRepository } from '../../repositories/rental.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildPaginationMeta } from '../../utils/pagination.js';

const bookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
const bookingUpdateSchema = z.object({ status: rentalBookingStatusSchema }).strict();

function parseInput(body: unknown) {
  const parsed = rentalCatalogItemSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestError('Rental catalogue fields are invalid.', 'VALIDATION_ERROR', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })));
  return parsed.data;
}

export const adminRentalController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await rentalRepository.list(false)); } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await rentalRepository.create(parseInput(req.body));
      await auditService.record({ actor: req.adminUser, action: 'RENTAL_CREATE', entity: 'Rental', entityId: String(created.id), diff: req.body, req });
      return sendSuccess(res, created, { statusCode: 201 });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const updated = await rentalRepository.update(id, parseInput(req.body));
      await auditService.record({ actor: req.adminUser, action: 'RENTAL_UPDATE', entity: 'Rental', entityId: id, diff: req.body, req });
      return sendSuccess(res, updated);
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      await rentalRepository.delete(id);
      await auditService.record({ actor: req.adminUser, action: 'RENTAL_DELETE', entity: 'Rental', entityId: id, req });
      return sendSuccess(res, { deleted: true });
    } catch (error) { next(error); }
  },
  async listBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = bookingQuerySchema.parse(req.query);
      const result = await rentalRepository.listBookings(page, limit);
      return sendSuccess(res, result.bookings, { meta: buildPaginationMeta(page, limit, result.total) });
    } catch (error) { next(error); }
  },
  async updateBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const { status } = bookingUpdateSchema.parse(req.body);
      const updated = await rentalRepository.updateBooking(id, status);
      await auditService.record({ actor: req.adminUser, action: 'RENTAL_BOOKING_UPDATE', entity: 'RentalBooking', entityId: id, diff: { status }, req });
      return sendSuccess(res, updated);
    } catch (error) { next(error); }
  },
};
