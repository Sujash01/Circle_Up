import type { Request, Response, NextFunction } from 'express';
import { Event } from '../../models/Event.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';
import { isSupabaseConfigured, getSupabaseAdminClient } from '../../services/supabase.service.js';

export const adminEventController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client.from('events').select('*').order('created_at', { ascending: false });
          if (!error && Array.isArray(data) && data.length > 0) {
            return sendSuccess(res, data);
          }
        } catch {
          // Fall back
        }
      }

      if (mongoose.connection.readyState === 1) {
        const events = await Event.find().sort({ createdAt: -1 }).lean();
        return sendSuccess(res, events);
      }
      return sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      let createdEvent: any = null;
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client.from('events').insert([req.body]).select('*').single();
          if (!error && data) createdEvent = data;
        } catch {
          /* ignore */
        }
      }

      if (mongoose.connection.readyState === 1) {
        const event = await Event.create(req.body);
        if (!createdEvent) createdEvent = event;
      }

      if (!createdEvent) {
        createdEvent = { id: `event-${Date.now()}`, ...req.body };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'EVENT_CREATE',
        entity: 'Event',
        entityId: String(createdEvent.id || createdEvent._id || 'new-event'),
        diff: req.body,
        req,
      });
      return sendSuccess(res, createdEvent, { statusCode: 201 });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      let updatedEvent: any = null;

      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client.from('events').update(req.body).eq('id', id).select('*').maybeSingle();
          if (!error && data) updatedEvent = data;
        } catch {
          /* ignore */
        }
      }

      if (mongoose.connection.readyState === 1) {
        const updated = await Event.findByIdAndUpdate(
          id,
          { $set: req.body },
          { new: true, runValidators: true },
        );
        if (!updatedEvent) updatedEvent = updated;
      }

      if (!updatedEvent) {
        updatedEvent = { id, ...req.body };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'EVENT_UPDATE',
        entity: 'Event',
        entityId: id || 'unknown',
        diff: req.body,
        req,
      });
      return sendSuccess(res, updatedEvent);
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
          await client.from('events').delete().eq('id', id);
        } catch {
          /* ignore */
        }
      }

      if (mongoose.connection.readyState === 1) {
        await Event.findByIdAndDelete(id);
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'EVENT_DELETE',
        entity: 'Event',
        entityId: id || 'unknown',
        req,
      });
      return sendSuccess(res, { deleted: true });
    } catch (error) {
      next(error);
    }
  },
};
