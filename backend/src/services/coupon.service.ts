import { couponRepository, type CouponRecord } from '../repositories/coupon.repository.js';
import { BadRequestError, ServiceUnavailableError } from '../errors/AppError.js';
import { formatPrice, storefrontLinkSchema, storefrontSettingsSchema, type CouponValidateResult } from '@circleup/shared';
import { getConfiguredWhatsappNumber, settingsRepository } from '../repositories/settings.repository.js';

const invalid = (code: string, message = 'Invalid or expired promotional code.'): CouponValidateResult => ({
  valid: false, code: code.trim().toUpperCase(), discountInPaise: 0, message,
});

export interface CouponValidationContext {
  customerId?: string;
  customerEmail?: string;
  productIds?: string[];
}

export function isPubliclyAdvertisableCoupon(coupon: CouponRecord, now = Date.now()): boolean {
  return coupon.isActive
    && coupon.targetTier === 'ALL'
    && coupon.appliesTo === 'ALL'
    && !coupon.assignedCustomerId
    && !coupon.assignedCustomerEmail
    && (coupon.discountType === 'PERCENTAGE' || coupon.discountType === 'FLAT')
    && (!coupon.startsAt || Date.parse(coupon.startsAt) <= now)
    && (!coupon.expiresAt || Date.parse(coupon.expiresAt) > now)
    && (coupon.usageLimit === undefined || coupon.usageCount < coupon.usageLimit);
}

export const couponService = {
  async getStorefrontSettings() {
    const [coupons, settings] = await Promise.all([
      couponRepository.listPromotions(),
      settingsRepository.getSettings(),
    ]);
    const now = Date.now();
    const visible = coupons.filter((coupon) => isPubliclyAdvertisableCoupon(coupon, now));
    const header = visible.find((coupon) => coupon.showInHeader);
    const exit = visible.find((coupon) => coupon.showInExitIntent);
    const announcementLink = storefrontLinkSchema.safeParse(settings.announcementLink);

    let settingsHeaderActive = settings.isAnnouncementActive
      && (!settings.announcementStartsAt || Date.parse(settings.announcementStartsAt) <= now)
      && (!settings.announcementEndsAt || Date.parse(settings.announcementEndsAt) > now);
    let linkedAnnouncementCode: string | undefined;

    if (!header && settingsHeaderActive && settings.announcementCouponCode?.trim()) {
      const linked = await couponRepository.findByCode(settings.announcementCouponCode);
      if (linked && isPubliclyAdvertisableCoupon(linked, now)) {
        linkedAnnouncementCode = linked.code;
      } else {
        // Never advertise disabled, expired, exhausted, or customer-restricted coupons
        settingsHeaderActive = false;
      }
    }

    const payload = storefrontSettingsSchema.safeParse({
      header: header ? {
        text: header.headerBannerText || `${header.code}: ${header.description || 'Special discount'}`,
        link: '/new-arrivals',
        code: header.code,
        ctaLabel: header.headerCtaLabel,
        isActive: true,
      } : {
        text: settings.announcementText,
        link: announcementLink.success ? announcementLink.data : '/new-arrivals',
        ...(linkedAnnouncementCode ? { code: linkedAnnouncementCode, ctaLabel: 'Copy Code' } : {}),
        isActive: settingsHeaderActive,
      },
      exitOffer: exit ? {
        code: exit.code,
        headline: exit.popupHeadline || 'Your next favorite find is waiting',
        subtext: exit.popupSubtext || 'Take a small thank-you toward something one of a kind.',
        badgeText: exit.popupBadgeText || (exit.discountType === 'PERCENTAGE'
          ? `${exit.value}% off` : `${formatPrice(exit.value)} off`),
        targetPages: exit.targetPages,
        cooldownHours: exit.cooldownHours,
      } : null,
      automaticCodes: visible.filter((coupon) => coupon.autoApply).map((coupon) => coupon.code),
      whatsappNumber: settings.isWhatsappVerified ? getConfiguredWhatsappNumber(settings.whatsappNumber) : '',
    });
    if (!payload.success) {
      throw new ServiceUnavailableError('Storefront promotions are temporarily unavailable.', 'PROMOTIONS_UNAVAILABLE');
    }
    return payload.data;
  },
  async validateCoupon(
    code: string,
    subtotalInPaise: number,
    context?: CouponValidationContext,
  ): Promise<CouponValidateResult> {
    if (!code || !code.trim()) throw new BadRequestError('Coupon code is required.', 'COUPON_REQUIRED');
    const coupon = await couponRepository.findByCode(code);
    if (!coupon || !coupon.isActive) return invalid(code);
    if (coupon.discountType !== 'PERCENTAGE' && coupon.discountType !== 'FLAT') {
      return invalid(code, `Promo code discount type "${coupon.discountType}" is not supported at checkout.`);
    }
    const now = Date.now();
    if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return invalid(code, 'This promo code is not yet active.');
    if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= now) return invalid(code, 'This promo code has expired.');
    if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
      return invalid(code, 'This promo code has reached its maximum usage limit.');
    }

    const email = context?.customerEmail?.trim().toLowerCase();
    const customerId = context?.customerId?.trim();

    if (coupon.assignedCustomerId) {
      if (!customerId) {
        return invalid(code, 'This promo code is restricted to a specific customer account. Please sign in to apply.');
      }
      if (coupon.assignedCustomerId !== customerId) {
        return invalid(code, 'This promo code is restricted to a different customer account.');
      }
    }

    if (coupon.assignedCustomerEmail) {
      if (!email) {
        return invalid(code, 'This promo code is restricted to a specific customer. Enter your email at checkout to apply.');
      }
      if (coupon.assignedCustomerEmail.trim().toLowerCase() !== email) {
        return invalid(code, 'This promo code is restricted to a different customer account.');
      }
    }

    if (coupon.appliesTo === 'SPECIFIC_PRODUCTS') {
      if (coupon.applicableProductIds.length === 0) {
        return invalid(code, `Code ${coupon.code} has no eligible products configured.`);
      }
      if (context?.productIds) {
        const hasMatchingProduct = context.productIds.some((id) => coupon.applicableProductIds.includes(id));
        if (!hasMatchingProduct) {
          return invalid(code, `Code ${coupon.code} does not apply to the items in your bag.`);
        }
      }
    } else if (coupon.appliesTo && coupon.appliesTo !== 'ALL') {
      return invalid(code, `Code ${coupon.code} uses an unsupported applicability scope (${coupon.appliesTo}).`);
    }

    if (coupon.perCustomerLimit && (context?.customerId || context?.customerEmail)) {
      const usedByCustomer = await couponRepository.countCustomerUsage(
        coupon.code,
        context.customerId,
        context.customerEmail,
      );
      if (usedByCustomer >= coupon.perCustomerLimit) {
        return invalid(code, 'You have already reached the usage limit for this promo code.');
      }
    }

    if (subtotalInPaise < coupon.minOrderAmount) {
      const minInRupees = Math.round(coupon.minOrderAmount / 100);
      return invalid(code, `Code ${coupon.code} requires a minimum bag value of ₹${minInRupees.toLocaleString('en-IN')}.`);
    }

    let discountInPaise = coupon.discountType === 'PERCENTAGE'
      ? Math.trunc((subtotalInPaise * coupon.value) / 100)
      : Math.min(coupon.value, subtotalInPaise);
    if (coupon.discountType === 'PERCENTAGE' && coupon.maxDiscountAmount !== undefined) {
      discountInPaise = Math.min(discountInPaise, coupon.maxDiscountAmount);
    }
    discountInPaise = Math.min(discountInPaise, subtotalInPaise);
    return { valid: true, code: coupon.code, discountInPaise, message: `Promo code ${coupon.code} applied successfully!` };
  },
};
