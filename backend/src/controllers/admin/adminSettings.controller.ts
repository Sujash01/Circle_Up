import type { Request, Response, NextFunction } from 'express';
import { SiteSettings } from '../../models/SiteSettings.js';
import { settingsRepository } from '../../repositories/settings.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';
import { isSupabaseConfigured, getSupabaseAdminClient } from '../../services/supabase.service.js';

export const adminSettingsController = {
  async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client
            .from('site_settings')
            .select('*')
            .eq('id', 'default')
            .maybeSingle();

          if (!error && data) {
            return sendSuccess(res, {
              announcementText: data.announcement_text || '',
              announcementLink: data.announcement_link || '',
              isAnnouncementActive: Boolean(data.is_announcement_active),
              marqueePhrases: Array.isArray(data.marquee_phrases) ? data.marquee_phrases : [],
              storeAddress: data.store_address || '',
              contactEmail: data.contact_email || '',
              contactPhone: data.contact_phone || '',
              whatsappNumber: data.whatsapp_number || '',
              isWhatsappVerified: Boolean(data.whatsapp_number),
              categoryTiles: data.category_tiles || [],
              curatedDrop: data.curated_drop || { enabled: false },
              contentVersion: 1,
            });
          }
        } catch {
          // Fall back
        }
      }

      const settings = await settingsRepository.getSettings();
      return sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  },

  async getActivity(_req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await auditService.list();
      return sendSuccess(res, logs);
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body;
      let resultSettings: any = null;

      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const row: Record<string, unknown> = {};
          if (data.announcementText !== undefined) row.announcement_text = data.announcementText;
          if (data.announcementLink !== undefined) row.announcement_link = data.announcementLink;
          if (data.isAnnouncementActive !== undefined) row.is_announcement_active = data.isAnnouncementActive;
          if (data.marqueePhrases !== undefined) row.marquee_phrases = data.marqueePhrases;
          if (data.storeAddress !== undefined) row.store_address = data.storeAddress;
          if (data.contactEmail !== undefined) row.contact_email = data.contactEmail;
          if (data.contactPhone !== undefined) row.contact_phone = data.contactPhone;
          if (data.whatsappNumber !== undefined) row.whatsapp_number = data.whatsappNumber;
          if (data.categoryTiles !== undefined) row.category_tiles = data.categoryTiles;
          if (data.curatedDrop !== undefined) row.curated_drop = data.curatedDrop;
          if (data.customDrop !== undefined) row.curated_drop = data.customDrop;
          row.updated_at = new Date().toISOString();

          const { data: updated, error } = await client
            .from('site_settings')
            .upsert({ id: 'default', ...row })
            .select('*')
            .single();

          if (!error && updated) {
            resultSettings = {
              announcementText: updated.announcement_text,
              announcementLink: updated.announcement_link,
              isAnnouncementActive: updated.is_announcement_active,
              marqueePhrases: updated.marquee_phrases,
              storeAddress: updated.store_address,
              contactEmail: updated.contact_email,
              contactPhone: updated.contact_phone,
              whatsappNumber: updated.whatsapp_number,
              isWhatsappVerified: Boolean(updated.whatsapp_number),
              categoryTiles: updated.category_tiles,
              curatedDrop: updated.curated_drop,
              contentVersion: 2,
            };
          }
        } catch {
          // Fall back
        }
      }

      if (mongoose.connection.readyState === 1) {
        const updated = await SiteSettings.findOneAndUpdate(
          {},
          { $set: req.body, $inc: { contentVersion: 1 } },
          { new: true, upsert: true },
        );
        if (!resultSettings) resultSettings = updated;
      }

      if (!resultSettings) {
        resultSettings = { ...req.body, contentVersion: 2 };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'SETTINGS_UPDATE',
        entity: 'SiteSettings',
        entityId: 'global',
        diff: req.body,
        req,
      });

      return sendSuccess(res, resultSettings);
    } catch (error) {
      next(error);
    }
  },
};

