import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  announcementUpdateSchema,
  couponAdminCreateSchema,
  couponValidatePayloadSchema,
  customerCouponIssueSchema,
} from '@circleup/shared';

const srcDir = path.resolve(__dirname, '../src');

describe('Coupons, Customer Compensation & Announcement Bar', () => {
  it('validates percentage bounds and schedule order in shared coupon schemas', () => {
    expect(
      couponAdminCreateSchema.safeParse({
        code: 'BADPCT',
        discountType: 'PERCENTAGE',
        value: 150,
      }).success,
    ).toBe(false);

    expect(
      couponAdminCreateSchema.safeParse({
        code: 'BADDATES',
        discountType: 'PERCENTAGE',
        value: 15,
        startsAt: '2026-12-10T00:00:00.000Z',
        expiresAt: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      couponAdminCreateSchema.safeParse({
        code: 'GOOD15',
        discountType: 'PERCENTAGE',
        value: 15,
      }).success,
    ).toBe(true);
  });

  it('validates customer-specific goodwill coupon issuance and announcement bar payloads', () => {
    expect(
      customerCouponIssueSchema.safeParse({
        customerId: '11111111-1111-4111-8111-111111111111',
        discountType: 'FLAT',
        value: 25000,
        issueReason: 'ab',
      }).success,
    ).toBe(false);

    expect(
      customerCouponIssueSchema.safeParse({
        customerId: '11111111-1111-4111-8111-111111111111',
        code: 'SORRY250',
        discountType: 'FLAT',
        value: 25000,
        usageLimit: 1,
        perCustomerLimit: 1,
        issueReason: 'Delayed order compensation',
      }).success,
    ).toBe(true);

    expect(
      announcementUpdateSchema.safeParse({
        announcementText: 'Festive Drop',
        announcementLink: '/new-arrivals',
        isAnnouncementActive: true,
        announcementCouponCode: 'FESTIVE15',
        announcementStartsAt: '2026-12-10T00:00:00.000Z',
        announcementEndsAt: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      couponValidatePayloadSchema.safeParse({
        code: 'SORRY250',
        subtotalInPaise: 50000,
        customerEmail: 'asha@example.com',
        productIds: ['prod-1'],
      }).success,
    ).toBe(true);
  });

  it('wires CRM CouponsPage for search, filters, customer coupons, redemptions, and announcement preview', () => {
    const src = fs.readFileSync(path.join(srcDir, 'admin/pages/CouponsPage.tsx'), 'utf8');
    expect(src).toContain('Issue Customer Coupon');
    expect(src).toContain('Redemption History');
    expect(src).toContain('Announcement Bar');
    expect(src).toContain('Live Storefront Preview');
    expect(src).toContain('formatPrice');
    expect(src).toContain('adminApi.issueCustomerCoupon');
    expect(src).toContain('adminApi.getCouponRedemptions');
    expect(src).toContain('adminApi.updateAnnouncementSettings');
  });

  it('passes customer context and productIds from CartPage to storefrontApi.validateCoupon', () => {
    const cartSrc = fs.readFileSync(path.join(srcDir, 'features/public/CartPage.tsx'), 'utf8');
    const apiSrc = fs.readFileSync(path.join(srcDir, 'services/storefrontApi.ts'), 'utf8');
    expect(cartSrc).toContain('customerEmail: effectiveEmail');
    expect(cartSrc).toContain('productIds: cartProductIds');
    expect(apiSrc).toContain("'/api/coupons/validate'");
    expect(apiSrc).toContain('customerEmail');
  });
});
