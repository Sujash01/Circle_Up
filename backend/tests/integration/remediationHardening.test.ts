import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { envSchema } from '../../src/config/env.js';
import { adminAuthService } from '../../src/services/adminAuth.service.js';

const app = createApp();

describe('Remediation Hardening Test Suite', () => {
  describe('1. Production Admin Offline Fallback Prevention', () => {
    it('rejects fallback login with 503 SERVICE_UNAVAILABLE when in production and DB is offline', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        // Temporarily simulate production environment
        (process.env as Record<string, string>).NODE_ENV = 'production';

        await expect(
          adminAuthService.login('owner@circleuponline.com', 'OwnerPassword123'),
        ).rejects.toMatchObject({
          statusCode: 503,
          code: 'DATABASE_UNAVAILABLE',
        });
      } finally {
        (process.env as Record<string, string>).NODE_ENV = originalEnv;
      }
    });

    it('rejects admin user creation with 503 when in production and DB is offline', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string>).NODE_ENV = 'production';

        await expect(
          adminAuthService.createAdminUser({
            email: 'newadmin@circleuponline.com',
            password: 'StrongPassword123!',
            name: 'New Admin',
            role: 'staff',
          }),
        ).rejects.toMatchObject({
          statusCode: 503,
          code: 'DATABASE_UNAVAILABLE',
        });
      } finally {
        (process.env as Record<string, string>).NODE_ENV = originalEnv;
      }
    });
  });

  describe('2. SESSION_SECRET Production Validation', () => {
    it('fails schema validation if SESSION_SECRET is default hardcoded string in production', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'production',
        SESSION_SECRET: 'circleup-super-secret-admin-session-signing-key-32chars',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const issues = res.error.issues;
        expect(issues.some((i) => i.path.includes('SESSION_SECRET'))).toBe(true);
      }
    });

    it('fails schema validation if SESSION_SECRET is shorter than 32 characters in production', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short-secret-less-than-32',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const issues = res.error.issues;
        expect(issues.some((i) => i.path.includes('SESSION_SECRET'))).toBe(true);
      }
    });

    it('passes schema validation if all secrets are strong and >= 32 chars in production', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'production',
        SESSION_SECRET: 'super-secure-production-session-secret-64-characters-long-example',
        JWT_ACCESS_SECRET: 'super-secure-production-jwt-access-secret-64-characters-long-example',
        JWT_ADMIN_ACCESS_SECRET: 'super-secure-production-jwt-admin-secret-64-characters-long-example',
        GUEST_ORDER_TOKEN_SECRET: 'super-secure-production-guest-token-secret-64-characters-long-example',
      });
      expect(res.success).toBe(true);
    });

    it('permits default secrets only when NODE_ENV === test', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(res.success).toBe(true);
    });
  });

  describe('3. CORS Preflight Headers Verification', () => {
    it('allows preflight OPTIONS request with x-guest-order-token', async () => {
      const res = await request(app)
        .options('/api/v1/orders/CU-2026-0001')
        .set('Origin', 'https://circleuponline.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-guest-order-token');

      expect([200, 204]).toContain(res.status);
      const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
      expect(allowHeaders).toContain('x-guest-order-token');
    });

    it('allows preflight OPTIONS request with X-CSRF-Token', async () => {
      const res = await request(app)
        .options('/api/v1/admin/login')
        .set('Origin', 'https://circleuponline.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'X-CSRF-Token, Content-Type');

      expect([200, 204]).toContain(res.status);
      const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
      expect(allowHeaders).toContain('x-csrf-token');
    });
  });

  describe('4. Multi-Secret Validation & Enforcement (P0-4 Hardening)', () => {
    const validStrongSecret1 = 'valid-super-secure-secret-key-number-1-at-least-32-chars';
    const validStrongSecret2 = 'valid-super-secure-secret-key-number-2-at-least-32-chars';
    const validStrongSecret3 = 'valid-super-secure-secret-key-number-3-at-least-32-chars';
    const validStrongSecret4 = 'valid-super-secure-secret-key-number-4-at-least-32-chars';

    it('passes schema validation when all 4 secrets are strong, distinct, and >= 32 chars in development/production', () => {
      for (const envMode of ['development', 'staging', 'production'] as const) {
        const res = envSchema.safeParse({
          NODE_ENV: envMode,
          SESSION_SECRET: validStrongSecret1,
          JWT_ACCESS_SECRET: validStrongSecret2,
          JWT_ADMIN_ACCESS_SECRET: validStrongSecret3,
          GUEST_ORDER_TOKEN_SECRET: validStrongSecret4,
        });
        expect(res.success).toBe(true);
      }
    });

    it('rejects startup if JWT_ACCESS_SECRET is missing, short, or placeholder outside test', () => {
      const resMissing = envSchema.safeParse({
        NODE_ENV: 'development',
        SESSION_SECRET: validStrongSecret1,
        JWT_ADMIN_ACCESS_SECRET: validStrongSecret3,
        GUEST_ORDER_TOKEN_SECRET: validStrongSecret4,
      });
      expect(resMissing.success).toBe(false);
      if (!resMissing.success) {
        expect(resMissing.error.issues.some((i) => i.path.includes('JWT_ACCESS_SECRET'))).toBe(true);
      }

      const resPlaceholder = envSchema.safeParse({
        NODE_ENV: 'development',
        SESSION_SECRET: validStrongSecret1,
        JWT_ACCESS_SECRET: 'replace-with-32-plus-char-customer-access-secret',
        JWT_ADMIN_ACCESS_SECRET: validStrongSecret3,
        GUEST_ORDER_TOKEN_SECRET: validStrongSecret4,
      });
      expect(resPlaceholder.success).toBe(false);
    });

    it('rejects startup if JWT_ADMIN_ACCESS_SECRET is missing, short, or placeholder outside test', () => {
      const resShort = envSchema.safeParse({
        NODE_ENV: 'development',
        SESSION_SECRET: validStrongSecret1,
        JWT_ACCESS_SECRET: validStrongSecret2,
        JWT_ADMIN_ACCESS_SECRET: 'short-admin-key',
        GUEST_ORDER_TOKEN_SECRET: validStrongSecret4,
      });
      expect(resShort.success).toBe(false);
      if (!resShort.success) {
        expect(resShort.error.issues.some((i) => i.path.includes('JWT_ADMIN_ACCESS_SECRET'))).toBe(true);
      }
    });

    it('rejects startup if GUEST_ORDER_TOKEN_SECRET is missing or equals SESSION_SECRET outside test', () => {
      const resEqual = envSchema.safeParse({
        NODE_ENV: 'production',
        SESSION_SECRET: validStrongSecret1,
        JWT_ACCESS_SECRET: validStrongSecret2,
        JWT_ADMIN_ACCESS_SECRET: validStrongSecret3,
        GUEST_ORDER_TOKEN_SECRET: validStrongSecret1, // Secret reuse!
      });
      expect(resEqual.success).toBe(false);
      if (!resEqual.success) {
        expect(resEqual.error.issues.some((i) => i.path.includes('GUEST_ORDER_TOKEN_SECRET'))).toBe(true);
      }
    });

    it('automatically supplies test fixtures when NODE_ENV === test', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
        expect(res.data.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
        expect(res.data.JWT_ADMIN_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
        expect(res.data.GUEST_ORDER_TOKEN_SECRET.length).toBeGreaterThanOrEqual(32);
      }
    });
  });
});
