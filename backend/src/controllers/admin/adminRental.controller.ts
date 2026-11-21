import type { Request, Response, NextFunction } from 'express';
import { Rental } from '../../models/Rental.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';
import { isSupabaseConfigured, getSupabaseAdminClient } from '../../services/supabase.service.js';

export const adminRentalController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client
            .from('rental_bookings')
            .select('*')
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(data) && data.length > 0) {
            return sendSuccess(res, data);
          }
        } catch {
          // Fall back
        }
      }

      if (mongoose.connection.readyState === 1) {
        const rentals = await Rental.find().sort({ createdAt: -1 }).lean();
        return sendSuccess(res, rentals);
      }
      return sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      let createdRental: any = null;
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client.from('rental_bookings').insert([req.body]).select('*').single();
          if (!error && data) createdRental = data;
        } catch {
          /* ignore */
        }
      }

      if (mongoose.connection.readyState === 1) {
        const rental = await Rental.create(req.body);
        if (!createdRental) createdRental = rental;
      }

      if (!createdRental) {
        createdRental = { id: `rental-${Date.now()}`, ...req.body };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'RENTAL_CREATE',
        entity: 'Rental',
        entityId: String(createdRental.id || createdRental._id || 'new-rental'),
        diff: req.body,
        req,
      });
      return sendSuccess(res, createdRental, { statusCode: 201 });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      let updatedRental: any = null;

      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client.from('rental_bookings').update(req.body).eq('id', id).select('*').maybeSingle();
          if (!error && data) updatedRental = data;
        } catch {
          /* ignore */
        }
      }

      if (mongoose.connection.readyState === 1) {
        const updated = await Rental.findByIdAndUpdate(
          id,
          { $set: req.body },
          { new: true, runValidators: true },
        );
        if (!updatedRental) updatedRental = updated;
      }

      if (!updatedRental) {
        updatedRental = { id, ...req.body };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'RENTAL_UPDATE',
        entity: 'Rental',
        entityId: id || 'unknown',
        diff: req.body,
        req,
      });
      return sendSuccess(res, updatedRental);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          await client.from('rental_bookings').delete().eq('id', id);
        } catch {
          /* ignore */
        }
      }

      if (mongoose.connection.readyState === 1) {
        await Rental.findByIdAndDelete(id);
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'RENTAL_DELETE',
        entity: 'Rental',
        entityId: id || 'unknown',
        req,
      });
      return sendSuccess(res, { deleted: true });
    } catch (error) {
      next(error);
    }
  },
};
