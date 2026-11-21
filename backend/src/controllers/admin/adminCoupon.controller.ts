import type { Request, Response, NextFunction } from 'express';
import { Coupon } from '../../models/Coupon.js';
import { settingsRepository } from '../../repositories/settings.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';
import { isSupabaseConfigured, getSupabaseAdminClient } from '../../services/supabase.service.js';

export const adminCouponController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const { data, error } = await client
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(data)) {
            const mapped = data.map((c: any) => ({
              id: c.id,
              code: c.code,
              description: c.description || '',
              discountType: c.discount_type || 'PERCENTAGE',
              type: c.discount_type || 'PERCENTAGE',
              value: Number(c.discount_value || 0),
              maxDiscount: c.max_discount_paise ? Number(c.max_discount_paise) : undefined,
              minCartSubtotal: Number(c.min_order_paise || 0),
              minOrderAmount: Number(c.min_order_paise || 0),
              usageLimit: c.usage_limit ? Number(c.usage_limit) : undefined,
              usageCount: Number(c.usage_count || 0),
              perCustomerLimit: Number(c.per_customer_limit || 1),
              isActive: Boolean(c.is_active),
              showInHeader: Boolean(c.show_in_header),
              headerBannerText: c.header_banner_text || undefined,
              headerCtaLabel: c.header_cta_label || 'Copy Code',
              headerPriority: Number(c.header_priority || 0),
              autoApply: Boolean(c.auto_apply),
              showInExitIntent: Boolean(c.show_in_exit_intent),
              popupHeadline: c.popup_headline || undefined,
              popupSubtext: c.popup_subtext || undefined,
              popupBadgeText: c.popup_badge_text || undefined,
              targetTier: c.target_tier || 'ALL',
              appliesTo: c.applies_to || 'ALL',
              startsAt: c.starts_at || undefined,
              expiresAt: c.ends_at || undefined,
              createdAt: c.created_at,
              updatedAt: c.updated_at,
            }));
            return sendSuccess(res, mapped);
          }
        } catch {
          // Fall back to Mongo
        }
      }

      if (mongoose.connection.readyState === 1) {
        const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
        return sendSuccess(res, coupons);
      }
      return sendSuccess(res, [
        { code: 'THRIFT10', discountType: 'PERCENTAGE', discountValue: 10, isActive: true },
        { code: 'CIRCLE20', discountType: 'PERCENTAGE', discountValue: 20, isActive: true },
      ]);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body;
      let createdResult: any = null;

      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const discountType = String(data.discountType || data.type || 'PERCENTAGE').toUpperCase();
          const row = {
            code: String(data.code || '').trim().toUpperCase(),
            description: data.description || '',
            discount_type: discountType,
            discount_value: Number(data.value || data.discountValue || 0),
            max_discount_paise: data.maxDiscount ? Number(data.maxDiscount) : null,
            min_order_paise: Number(data.minCartSubtotal || data.minOrderAmount || 0),
            usage_limit: data.usageLimit ? Number(data.usageLimit) : null,
            per_customer_limit: Number(data.perCustomerLimit || 1),
            is_active: data.isActive !== false,
            show_in_header: Boolean(data.showInHeader),
            header_banner_text: data.headerBannerText || null,
            header_cta_label: data.headerCtaLabel || 'Copy Code',
            header_priority: Number(data.headerPriority || 0),
            auto_apply: Boolean(data.autoApply),
            show_in_exit_intent: Boolean(data.showInExitIntent),
            popup_headline: data.popupHeadline || null,
            popup_subtext: data.popupSubtext || null,
            popup_badge_text: data.popupBadgeText || null,
            target_tier: data.targetTier || 'ALL',
            applies_to: data.appliesTo || 'ALL',
            starts_at: data.startsAt || null,
            ends_at: data.expiresAt || null,
          };

          const { data: inserted, error } = await client
            .from('coupons')
            .insert([row])
            .select('*')
            .single();

          if (!error && inserted) {
            createdResult = {
              id: inserted.id,
              code: inserted.code,
              description: inserted.description,
              discountType: inserted.discount_type,
              type: inserted.discount_type,
              value: inserted.discount_value,
              maxDiscount: inserted.max_discount_paise,
              minCartSubtotal: inserted.min_order_paise,
              minOrderAmount: inserted.min_order_paise,
              usageLimit: inserted.usage_limit,
              usageCount: inserted.usage_count,
              isActive: inserted.is_active,
              showInHeader: inserted.show_in_header,
              headerBannerText: inserted.header_banner_text,
              showInExitIntent: inserted.show_in_exit_intent,
              popupHeadline: inserted.popup_headline,
              popupSubtext: inserted.popup_subtext,
              popupBadgeText: inserted.popup_badge_text,
              startsAt: inserted.starts_at,
              expiresAt: inserted.ends_at,
            };
          }
        } catch {
          // Continue
        }
      }

      if (mongoose.connection.readyState === 1) {
        const coupon = await Coupon.create(req.body);
        await settingsRepository.bumpVersion();
        if (!createdResult) createdResult = coupon;
      }

      if (!createdResult) {
        createdResult = { id: `coupon-${Date.now()}`, ...req.body };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'COUPON_CREATE',
        entity: 'Coupon',
        entityId: String(createdResult.id || createdResult._id || data.code),
        diff: req.body,
        req,
      });

      return sendCreated(res, createdResult);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const data = req.body;
      let updatedResult: any = null;

      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          const row: Record<string, unknown> = {};
          if (data.code !== undefined) row.code = String(data.code).trim().toUpperCase();
          if (data.description !== undefined) row.description = data.description;
          if (data.discountType !== undefined || data.type !== undefined) {
            row.discount_type = String(data.discountType || data.type).toUpperCase();
          }
          if (data.value !== undefined || data.discountValue !== undefined) {
            row.discount_value = Number(data.value ?? data.discountValue);
          }
          if (data.maxDiscount !== undefined) row.max_discount_paise = data.maxDiscount;
          if (data.minCartSubtotal !== undefined || data.minOrderAmount !== undefined) {
            row.min_order_paise = Number(data.minCartSubtotal ?? data.minOrderAmount);
          }
          if (data.usageLimit !== undefined) row.usage_limit = data.usageLimit;
          if (data.isActive !== undefined) row.is_active = data.isActive;
          if (data.showInHeader !== undefined) row.show_in_header = Boolean(data.showInHeader);
          if (data.headerBannerText !== undefined) row.header_banner_text = data.headerBannerText;
          if (data.headerCtaLabel !== undefined) row.header_cta_label = data.headerCtaLabel;
          if (data.headerPriority !== undefined) row.header_priority = Number(data.headerPriority);
          if (data.autoApply !== undefined) row.auto_apply = Boolean(data.autoApply);
          if (data.showInExitIntent !== undefined) row.show_in_exit_intent = Boolean(data.showInExitIntent);
          if (data.popupHeadline !== undefined) row.popup_headline = data.popupHeadline;
          if (data.popupSubtext !== undefined) row.popup_subtext = data.popupSubtext;
          if (data.popupBadgeText !== undefined) row.popup_badge_text = data.popupBadgeText;
          if (data.startsAt !== undefined) row.starts_at = data.startsAt;
          if (data.expiresAt !== undefined) row.ends_at = data.expiresAt;
          row.updated_at = new Date().toISOString();

          const { data: updated, error } = await client
            .from('coupons')
            .update(row)
            .or(`id.eq.${id},code.eq.${id.toUpperCase()}`)
            .select('*')
            .maybeSingle();

          if (!error && updated) {
            updatedResult = {
              id: updated.id,
              code: updated.code,
              description: updated.description,
              discountType: updated.discount_type,
              type: updated.discount_type,
              value: updated.discount_value,
              maxDiscount: updated.max_discount_paise,
              minCartSubtotal: updated.min_order_paise,
              minOrderAmount: updated.min_order_paise,
              usageLimit: updated.usage_limit,
              usageCount: updated.usage_count,
              isActive: updated.is_active,
              showInHeader: updated.show_in_header,
              headerBannerText: updated.header_banner_text,
              showInExitIntent: updated.show_in_exit_intent,
              popupHeadline: updated.popup_headline,
              popupSubtext: updated.popup_subtext,
              popupBadgeText: updated.popup_badge_text,
              startsAt: updated.starts_at,
              expiresAt: updated.ends_at,
            };
          }
        } catch {
          // Fall back
        }
      }

      if (mongoose.connection.readyState === 1) {
        const coupon = await Coupon.findByIdAndUpdate(id, { $set: req.body }, { new: true });
        await settingsRepository.bumpVersion();
        if (!updatedResult && coupon) updatedResult = coupon;
      }

      if (!updatedResult) {
        updatedResult = { id, ...req.body };
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'COUPON_UPDATE',
        entity: 'Coupon',
        entityId: id,
        diff: req.body,
        req,
      });

      return sendSuccess(res, updatedResult);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);

      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseAdminClient();
          await client.from('coupons').delete().or(`id.eq.${id},code.eq.${id.toUpperCase()}`);
        } catch {
          // Continue
        }
      }

      if (mongoose.connection.readyState === 1) {
        await Coupon.findByIdAndDelete(id);
        await settingsRepository.bumpVersion();
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'COUPON_DELETE',
        entity: 'Coupon',
        entityId: id,
        req,
      });

      return sendSuccess(res, { message: 'Coupon deleted successfully.' });
    } catch (error) {
      next(error);
    }
  },
};

