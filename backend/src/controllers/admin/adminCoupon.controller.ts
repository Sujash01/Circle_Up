import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import {
  announcementUpdateSchema,
  couponAdminCreateSchema,
  couponAdminUpdateSchema,
  customerCouponIssueSchema,
} from '@circleup/shared';
import { couponRepository } from '../../repositories/coupon.repository.js';
import { settingsRepository } from '../../repositories/settings.repository.js';
import { isPubliclyAdvertisableCoupon } from '../../services/coupon.service.js';
import { auditService } from '../../services/audit.service.js';
import { getSupabaseAdminClient } from '../../services/supabase.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';

function parseInput<T>(schema: { safeParse: (body: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: Array<string | number>; message: string }> } } }, body: unknown, message = 'Coupon details are invalid.'): T {
  const result = schema.safeParse(body);
  if (!result.success || result.data === undefined) {
    throw new BadRequestError(message, 'VALIDATION_ERROR', result.error?.issues.map((issue) => ({
      field: issue.path.join('.'), message: issue.message,
    })));
  }
  return result.data;
}

function generateCompensationCode(): string {
  return `CARE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export const adminCouponController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await couponRepository.list()); }
    catch (error) { next(error); }
  },
  async listRedemptions(req: Request, res: Response, next: NextFunction) {
    try {
      const couponId = typeof req.query.couponId === 'string' && req.query.couponId.trim()
        ? req.query.couponId.trim()
        : undefined;
      return sendSuccess(res, await couponRepository.listRedemptions(couponId));
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseInput(couponAdminCreateSchema, req.body);
      const created = await couponRepository.create(input);
      await auditService.record({ actor: req.adminUser, action: 'COUPON_CREATE', entity: 'Coupon', entityId: created.id, diff: input, req });
      return sendCreated(res, created);
    } catch (error) { next(error); }
  },
  async issueCustomerCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseInput(customerCouponIssueSchema, req.body, 'Customer coupon details are invalid.');
      const { data: customer, error } = await getSupabaseAdminClient()
        .from('customers')
        .select('id, email, name')
        .eq('id', input.customerId)
        .maybeSingle();
      if (error || !customer) {
        throw new NotFoundError('Selected customer was not found.', 'CUSTOMER_NOT_FOUND');
      }
      const code = (input.code || generateCompensationCode()).trim().toUpperCase();
      const created = await couponRepository.create({
        code,
        discountType: input.discountType,
        value: input.value,
        maxDiscountAmount: input.maxDiscountAmount ?? undefined,
        minOrderAmount: input.minOrderAmount,
        usageLimit: input.usageLimit,
        perCustomerLimit: input.perCustomerLimit,
        expiresAt: input.expiresAt ?? undefined,
        isActive: input.isActive,
        description: `Customer goodwill coupon for ${String(customer.name || customer.email)}: ${input.issueReason}`,
        targetTier: 'ALL',
        appliesTo: 'ALL',
        applicableProductIds: [],
        showInHeader: false,
        showInExitIntent: false,
        autoApply: false,
        assignedCustomerId: String(customer.id),
        assignedCustomerEmail: String(customer.email || '').trim().toLowerCase() || null,
        issueReason: input.issueReason,
      });
      await auditService.record({
        actor: req.adminUser,
        action: 'COUPON_ISSUE_CUSTOMER',
        entity: 'Coupon',
        entityId: created.id,
        diff: { code: created.code, customerId: customer.id, customerEmail: customer.email, issueReason: input.issueReason },
        req,
      });
      return sendCreated(res, created);
    } catch (error) { next(error); }
  },
  async getAnnouncement(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsRepository.getSettings();
      return sendSuccess(res, {
        announcementText: settings.announcementText,
        announcementLink: settings.announcementLink,
        isAnnouncementActive: settings.isAnnouncementActive,
        announcementCouponCode: settings.announcementCouponCode || '',
        announcementStartsAt: settings.announcementStartsAt ?? null,
        announcementEndsAt: settings.announcementEndsAt ?? null,
      });
    } catch (error) { next(error); }
  },
  async updateAnnouncement(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseInput(announcementUpdateSchema, req.body, 'Announcement settings are invalid.');
      const couponCode = input.announcementCouponCode.trim().toUpperCase();
      if (couponCode) {
        const coupon = await couponRepository.findByCode(couponCode);
        if (!coupon || !isPubliclyAdvertisableCoupon(coupon)) {
          throw new BadRequestError(
            `Coupon "${couponCode}" cannot be advertised because it is disabled, expired, exhausted, or customer-restricted.`,
            'INVALID_ANNOUNCEMENT_COUPON',
          );
        }
      }
      const updated = await settingsRepository.updateSettings({
        announcementText: input.announcementText,
        announcementLink: input.announcementLink || '/new-arrivals',
        isAnnouncementActive: input.isAnnouncementActive,
        announcementCouponCode: couponCode,
        announcementStartsAt: input.announcementStartsAt ?? null,
        announcementEndsAt: input.announcementEndsAt ?? null,
      });
      await auditService.record({
        actor: req.adminUser,
        action: 'ANNOUNCEMENT_UPDATE',
        entity: 'SiteSettings',
        entityId: 'default',
        diff: input,
        req,
      });
      return sendSuccess(res, updated);
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
