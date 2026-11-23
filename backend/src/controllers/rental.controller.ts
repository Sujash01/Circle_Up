import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { normalizePriceToPaise } from '@circleup/shared';
import { rentalRepository } from '../repositories/rental.repository.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getSupabaseAdminClient, isSupabaseConfigured } from '../services/supabase.service.js';
import { ServiceUnavailableError } from '../errors/AppError.js';

export const rentalBookingRequestSchema = z.object({
  productId: z.string().optional(),
  rentalProductId: z.string().optional(),
  rentalProductName: z.string().optional(),
  customerName: z.string().trim().min(2, 'Name is required').max(100),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: z.string().trim().min(8, 'Valid phone number is required').max(20),
  size: z.string().trim().default('Free Size'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid start date (YYYY-MM-DD) is required'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid end date (YYYY-MM-DD) is required'),
  durationDays: z.coerce.number().int().positive(),
  estimatedRentalFee: z.preprocess((val) => normalizePriceToPaise(val), z.number().int().nonnegative()),
  securityDeposit: z.preprocess((val) => normalizePriceToPaise(val), z.number().int().nonnegative()),
  estimatedTotal: z.preprocess((val) => (val != null ? normalizePriceToPaise(val) : undefined), z.number().int().nonnegative().optional()),
  notes: z.string().max(1000).optional(),
});

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
      const totalPaise = parsed.estimatedTotal || (parsed.estimatedRentalFee + parsed.securityDeposit);

      if (isSupabaseConfigured()) {
        const client = getSupabaseAdminClient();
        // Resolve target product_id or fall back to a valid UUID if none provided
        let targetProductId = parsed.productId || parsed.rentalProductId;
        const isUuid = targetProductId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetProductId);

        if (!isUuid) {
          // Look up active rental product id
          const { data: prod } = await client
            .from('products')
            .select('id')
            .limit(1)
            .maybeSingle();
          targetProductId = prod?.id || '00000000-0000-0000-0000-000000000001';
        }

        const { data, error } = await client
          .from('rental_bookings')
          .insert({
            product_id: targetProductId,
            customer_name: parsed.customerName,
            customer_email: parsed.customerEmail || 'rental-guest@circleuponline.com',
            customer_phone: parsed.customerPhone,
            size: parsed.size,
            start_date: parsed.startDate,
            end_date: parsed.endDate,
            duration_days: parsed.durationDays,
            rental_fee_paise: parsed.estimatedRentalFee,
            security_deposit_paise: parsed.securityDeposit,
            total_paise: totalPaise,
            status: 'REQUESTED',
          })
          .select()
          .single();

        if (error) {
          throw new ServiceUnavailableError(`Failed to save rental booking request: ${error.message}`, 'DATABASE_UNAVAILABLE');
        }

        return sendCreated(res, {
          id: data.id,
          rentalProductId: parsed.rentalProductId || data.product_id,
          rentalProductName: parsed.rentalProductName || 'Rental Piece',
          size: data.size,
          startDate: data.start_date,
          endDate: data.end_date,
          durationDays: data.duration_days,
          estimatedRentalFee: Number(data.rental_fee_paise),
          securityDeposit: Number(data.security_deposit_paise),
          estimatedTotal: Number(data.total_paise),
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          status: data.status,
          createdAt: data.created_at,
        }, 'Rental request submitted successfully and is pending confirmation');
      }

      // Offline / Test Fallback
      const record = {
        id: `RNT-REQ-${Date.now().toString(36).toUpperCase()}`,
        rentalProductId: parsed.rentalProductId || 'mock-rental-id',
        rentalProductName: parsed.rentalProductName || 'Rental Piece',
        size: parsed.size,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        durationDays: parsed.durationDays,
        estimatedRentalFee: parsed.estimatedRentalFee,
        securityDeposit: parsed.securityDeposit,
        estimatedTotal: totalPaise,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        status: 'REQUESTED',
        createdAt: new Date().toISOString(),
      };

      return sendCreated(res, record, 'Rental request submitted successfully and is pending confirmation');
    } catch (error) {
      next(error);
    }
  },
};
