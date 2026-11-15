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

    it('passes schema validation if SESSION_SECRET is strong and >= 32 chars in production', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'production',
        SESSION_SECRET: 'super-secure-production-session-secret-64-characters-long-example',
      });
      expect(res.success).toBe(true);
    });

    it('permits default SESSION_SECRET in development/test', () => {
      const res = envSchema.safeParse({
        NODE_ENV: 'development',
        SESSION_SECRET: 'circleup-super-secret-admin-session-signing-key-32chars',
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
});
