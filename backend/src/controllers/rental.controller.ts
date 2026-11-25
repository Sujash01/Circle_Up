import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { moneyPaiseSchema } from '@circleup/shared';
import { rentalRepository } from '../repositories/rental.repository.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { BadRequestError } from '../errors/AppError.js';

export const rentalBookingRequestSchema = z.object({
  productId: z.string().optional(),
  rentalProductId: z.string().optional(),
  rentalProductName: z.string().optional(),
  customerName: z.string().trim().min(2, 'Name is required').max(100),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: z.string().trim().regex(/^\+?[\d ()-]{8,20}$/)
    .transform((value) => value.replace(/[ ()-]/g, '')).pipe(z.string().regex(/^\+?\d{8,15}$/)),
  size: z.string().trim().min(1).max(80).default('Free Size'),
  startDate: z.string().date(),
  endDate: z.string().date(),
  durationDays: z.number().int().positive(),
  estimatedRentalFee: moneyPaiseSchema,
  securityDeposit: moneyPaiseSchema,
  estimatedTotal: moneyPaiseSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const rentalController = {
  async listRentals(_req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await rentalRepository.list(true));
    } catch (error) {
      next(error);
    }
  },

  async getRental(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await rentalRepository.get(String(req.params.identifier || '')));
    } catch (error) {
      next(error);
    }
  },

  async submitBookingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = rentalBookingRequestSchema.parse(req.body);
      const id = z.string().uuid().safeParse(parsed.rentalProductId || parsed.productId);
      if (!id.success) throw new BadRequestError('Choose an item from the rental catalog.', 'INVALID_RENTAL_BOOKING');
      const booking = await rentalRepository.submitBooking({ ...parsed, catalogId: id.data });
      return sendCreated(res, {
        id: booking.id,
        rentalProductId: booking.rentalCatalogId,
        rentalProductName: booking.productName,
        size: booking.size,
        startDate: booking.startDate,
        endDate: booking.endDate,
        durationDays: booking.durationDays,
        estimatedRentalFee: booking.rentalFeePaise,
        securityDeposit: booking.securityDepositPaise,
        estimatedTotal: booking.totalPaise,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        status: booking.status,
        createdAt: booking.createdAt,
      }, 'Rental request submitted successfully and is pending confirmation');
    } catch (error) {
      next(error);
    }
  },
};
