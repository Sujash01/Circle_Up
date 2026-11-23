import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emailService } from '../../src/services/email.service.js';
import { adminAuthService, validateAdminPassword } from '../../src/services/adminAuth.service.js';
import { shippingTaxService } from '../../src/services/shippingTax.service.js';
import { couponService } from '../../src/services/coupon.service.js';
import { marketingService } from '../../src/services/marketing.service.js';
import { couponRepository } from '../../src/repositories/coupon.repository.js';
import { vi } from 'vitest';

describe('P2 Hardening and Features Unit Suite', () => {
  describe('Database Migration (20261205000000_p2_hardening_and_features.sql)', () => {
    const migrationSql = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/20261205000000_p2_hardening_and_features.sql'),
      'utf8'
    );

    it('enforces atomic event registration with unique index and row-level capacity lock', () => {
      expect(migrationSql).toContain('idx_event_reg_unique_email');
      expect(migrationSql).toContain('register_for_event_atomic');
      expect(migrationSql).toContain('for update');
      expect(migrationSql).toContain('EVENT_CAPACITY_REACHED');
      expect(migrationSql).toContain('DUPLICATE_REGISTRATION');
    });

    it('captures UTR numbers, payment proofs, and audit logs on manual payment verification', () => {
      expect(migrationSql).toContain('utr_number text');
      expect(migrationSql).toContain('payment_proof_url text');
      expect(migrationSql).toContain('p_utr_number text');
      expect(migrationSql).toContain('p_payment_proof_url text');
      expect(migrationSql).toContain('ORDER_PAYMENT_VERIFIED');
    });

    it('defines daily payment reconciliation aggregate function', () => {
      expect(migrationSql).toContain('admin_get_daily_reconciliation');
      expect(migrationSql).toContain('reconciliation_date date');
      expect(migrationSql).toContain('verified_utr_count bigint');
    });

    it('defines atomic admin refund processing and stock restock logic', () => {
      expect(migrationSql).toContain('admin_process_order_refund');
      expect(migrationSql).toContain('ORDER_REFUNDED');
      expect(migrationSql).toContain("v_clean_action = 'RESTOCK'");
    });

    it('defines order fulfillment creation and updates order status to SHIPPED', () => {
      expect(migrationSql).toContain('admin_create_order_fulfillment');
      expect(migrationSql).toContain("status = 'SHIPPED'");
      expect(migrationSql).toContain('ORDER_FULFILLED');
    });

    it('defines newsletter subscriptions with RLS and public insert policy', () => {
      expect(migrationSql).toContain('create table if not exists public.newsletter_subscriptions');
      expect(migrationSql).toContain('alter table public.newsletter_subscriptions enable row level security');
      expect(migrationSql).toContain('grant insert on table public.newsletter_subscriptions to anon, authenticated');
    });
  });

  describe('Transactional Email Service (P2-1)', () => {
    beforeEach(() => {
      emailService.clearSentEmails();
    });

    it('dispatches order confirmation with paise-formatted currency without failing caller', async () => {
      const success = await emailService.sendOrderConfirmation(
        {
          orderNumber: 'ORD-261123-TEST001',
          customerEmail: 'kavya@example.com',
          customerName: 'Kavya',
          totalInPaise: 159000,
          subtotalInPaise: 150000,
          deliveryFeeInPaise: 9000,
          discountInPaise: 0,
        },
        [
          { title: 'Handwoven Vintage Blouse', size: 'M', priceInPaise: 150000, quantity: 1 },
        ]
      );

      expect(success).toBe(true);
      const sent = emailService.getSentEmails();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe('kavya@example.com');
      expect(sent[0].subject).toContain('ORD-261123-TEST001');
      expect(sent[0].text).toContain('₹1,590');
    });

    it('dispatches shipping update notification with carrier details', async () => {
      const success = await emailService.sendShippingUpdate(
        {
          orderNumber: 'ORD-261123-SHIP001',
          customerEmail: 'arjun@example.com',
          customerName: 'Arjun',
        },
        'DELHIVERY-987654321',
        'Delhivery'
      );

      expect(success).toBe(true);
      const sent = emailService.getSentEmails();
      expect(sent[0].to).toBe('arjun@example.com');
      expect(sent[0].subject).toContain('Shipped');
      expect(sent[0].text).toContain('DELHIVERY-987654321');
    });

    it('dispatches refund confirmation notification', async () => {
      const success = await emailService.sendRefundConfirmation(
        {
          orderNumber: 'ORD-261123-REF001',
          customerEmail: 'riya@example.com',
          customerName: 'Riya',
        },
        55000,
        'Size did not fit'
      );

      expect(success).toBe(true);
      const sent = emailService.getSentEmails();
      expect(sent[0].to).toBe('riya@example.com');
      expect(sent[0].text).toContain('₹550');
      expect(sent[0].text).toContain('Size did not fit');
    });
  });

  describe('Admin Auth Hardening & Password Validation (P2-9)', () => {
    it('rejects passwords that are too short', () => {
      expect(() => validateAdminPassword('short')).toThrowError(/at least 8 characters/);
    });

    it('accepts strong passwords and verifies MFA hook structure', async () => {
      expect(() => validateAdminPassword('StrongSecretPass123!')).not.toThrow();
      const valid = await adminAuthService.verifyOwnerMfaCode('user-1', '123456');
      expect(valid).toBe(true);
      const invalid = await adminAuthService.verifyOwnerMfaCode('user-1', 'abc');
      expect(invalid).toBe(false);
    });
  });

  describe('Shipping & Tax Settings Service (P2-3, P2-12)', () => {
    it('applies complimentary shipping above threshold (150,000 paise)', async () => {
      const result = await shippingTaxService.calculateDeliveryFee('110001', 150000);
      expect(result.deliveryFeePaise).toBe(0);
      expect(result.freeShippingThresholdPaise).toBe(150000);
    });

    it('applies standard delivery fee (9,000 paise) below threshold', async () => {
      const result = await shippingTaxService.calculateDeliveryFee('110001', 50000);
      expect(result.deliveryFeePaise).toBe(9000);
    });

    it('returns GST tax settings with inclusive mode and 5% slab', async () => {
      const tax = await shippingTaxService.getTaxSettings();
      expect(tax.mode).toBe('INCLUSIVE');
      expect(tax.gstSlabPercent).toBe(5);
    });
  });

  describe('Coupons Consistency (P2-5)', () => {
    it('validates supported PERCENTAGE and FLAT coupons', async () => {
      vi.spyOn(couponRepository, 'findByCode').mockResolvedValueOnce({
        id: 'c-pct',
        code: 'CIRCLE10',
        discountType: 'PERCENTAGE',
        value: 10,
        minOrderAmount: 50000,
        usageCount: 0,
        isActive: true,
      });

      const result = await couponService.validateCoupon('CIRCLE10', 100000);
      expect(result.valid).toBe(true);
      expect(result.discountInPaise).toBe(10000);
      expect(result.message).toContain('applied successfully');
    });

    it('rejects unsupported coupon types (FREE_SHIPPING, BOGO) consistently', async () => {
      vi.spyOn(couponRepository, 'findByCode').mockResolvedValueOnce({
        id: 'c-free',
        code: 'FREESHIP',
        discountType: 'FREE_SHIPPING' as any,
        value: 0,
        minOrderAmount: 0,
        usageCount: 0,
        isActive: true,
      });

      const result = await couponService.validateCoupon('FREESHIP', 100000);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('not supported at checkout');
    });
  });

  describe('Marketing & Abandoned Checkout Service (P2-6)', () => {
    it('rejects subscription without marketing consent', async () => {
      await expect(
        marketingService.subscribeNewsletter({
          email: 'test@example.com',
          consent: false,
        })
      ).rejects.toThrowError(/consent is required/i);
    });

    it('handles newsletter subscription and unsubscribe cleanly', async () => {
      const sub = await marketingService.subscribeNewsletter({
        email: 'subscriber@example.com',
        name: 'Curator',
        consent: true,
      });
      expect(sub.success).toBe(true);

      const unsub = await marketingService.unsubscribeNewsletter('subscriber@example.com');
      expect(unsub.success).toBe(true);
    });
  });
});
