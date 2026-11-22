import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isSupabaseConfigured,
  isSupabaseBackendConfigured,
  getSupabaseAdminClient,
  getSupabaseServiceClient,
  getSupabaseAnonClient,
  resetSupabaseClientForTesting,
} from '../../src/services/supabase.service.js';
import { env } from '../../src/config/env.js';
import { ServiceUnavailableError } from '../../src/errors/AppError.js';
import {
  getSupabaseServiceClient as getConfigServiceClient,
  isSupabaseBackendConfigured as isConfigSupabaseConfigured,
} from '../../src/config/supabase.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Authoritative Supabase Client Provider - Unit & Security Tests', () => {
  const originalUrl = env.SUPABASE_URL;
  const originalServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnonKey = env.SUPABASE_ANON_KEY;

  beforeEach(() => {
    resetSupabaseClientForTesting();
  });

  afterEach(() => {
    (env as any).SUPABASE_URL = originalUrl;
    (env as any).SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    (env as any).SUPABASE_ANON_KEY = originalAnonKey;
    resetSupabaseClientForTesting();
  });

  describe('isSupabaseConfigured & isSupabaseBackendConfigured', () => {
    it('returns true when valid credentials and URL are present', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-that-is-sufficiently-long';

      expect(isSupabaseConfigured()).toBe(true);
      expect(isSupabaseBackendConfigured()).toBe(true);
      expect(isConfigSupabaseConfigured()).toBe(true);
    });

    it('uses validated service credentials without a selectable Mongo checkout provider', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-that-is-sufficiently-long';

      expect(env).not.toHaveProperty('CHECKOUT_PROVIDER');
      expect(isSupabaseConfigured()).toBe(true);
      expect(isSupabaseBackendConfigured()).toBe(true);
    });

    it('fails closed when SUPABASE_URL is missing or empty', () => {
      (env as any).SUPABASE_URL = '';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-that-is-sufficiently-long';

      expect(isSupabaseConfigured()).toBe(false);
    });

    it('fails closed when SUPABASE_SERVICE_ROLE_KEY is missing or empty', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = '';

      expect(isSupabaseConfigured()).toBe(false);
    });

    it('fails closed when SUPABASE_URL contains placeholder strings or templates', () => {
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-that-is-sufficiently-long';

      (env as any).SUPABASE_URL = 'https://placeholder.supabase.co';
      expect(isSupabaseConfigured()).toBe(false);

      (env as any).SUPABASE_URL = 'https://xyz.supabase.co';
      expect(isSupabaseConfigured()).toBe(false);

      (env as any).SUPABASE_URL = 'https://<project-id>.supabase.co';
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('fails closed when SUPABASE_SERVICE_ROLE_KEY is a placeholder or template string', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';

      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'placeholder-key';
      expect(isSupabaseConfigured()).toBe(false);

      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'your-service-role-key-sample';
      expect(isSupabaseConfigured()).toBe(false);

      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'replace-with-supabase-service-role-key';
      expect(isSupabaseConfigured()).toBe(false);

      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'short-key-123';
      expect(isSupabaseConfigured()).toBe(false);
    });
  });

  describe('Privileged Client Singleton & Fail-Closed Behavior', () => {
    it('throws ServiceUnavailableError if credentials are missing or unconfigured', () => {
      (env as any).SUPABASE_URL = '';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = '';

      expect(() => getSupabaseAdminClient()).toThrow(ServiceUnavailableError);
      expect(() => getSupabaseServiceClient()).toThrow(ServiceUnavailableError);

      try {
        getSupabaseAdminClient();
      } catch (err: any) {
        expect(err.code).toBe('DATABASE_UNAVAILABLE');
      }
    });

    it('returns the exact same privileged singleton instance for both admin and serviceClient calls', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-that-is-sufficiently-long';

      const client1 = getSupabaseAdminClient();
      const client2 = getSupabaseServiceClient();
      const client3 = getSupabaseAdminClient();

      expect(client1).toBeDefined();
      expect(client1).toBe(client2);
      expect(client2).toBe(client3);
      expect(getConfigServiceClient()).toBe(client1);
    });

    it('resetSupabaseClientForTesting clears the cached singleton', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-that-is-sufficiently-long';

      const client1 = getSupabaseAdminClient();
      resetSupabaseClientForTesting();

      (env as any).SUPABASE_URL = 'https://another-project.supabase.co';
      const client2 = getSupabaseAdminClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe('Unprivileged Public Client (getSupabaseAnonClient)', () => {
    it('fails closed when SUPABASE_ANON_KEY is missing or template placeholder', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_ANON_KEY = '';

      expect(() => getSupabaseAnonClient()).toThrow(ServiceUnavailableError);

      (env as any).SUPABASE_ANON_KEY = 'placeholder-anon-key';
      expect(() => getSupabaseAnonClient()).toThrow(ServiceUnavailableError);

      (env as any).SUPABASE_ANON_KEY = 'replace-with-supabase-anon-key';
      expect(() => getSupabaseAnonClient()).toThrow(ServiceUnavailableError);
    });

    it('instantiates valid anon client when valid anon credentials exist', () => {
      (env as any).SUPABASE_URL = 'https://valid-project.supabase.co';
      (env as any).SUPABASE_ANON_KEY = 'valid-anon-key-that-is-sufficiently-long-for-testing';

      const anonClient = getSupabaseAnonClient();
      expect(anonClient).toBeDefined();

      const anonClient2 = getSupabaseAnonClient();
      expect(anonClient).toBe(anonClient2);
    });
  });

  describe('Inquiries & Storage Security Specifications', () => {
    const migrationFile = path.resolve(__dirname, '../../../supabase/migrations/20261123_inquiries_and_storage.sql');

    it('inquiries migration defines rigorous bounds check constraints preventing payload inflation', () => {
      expect(fs.existsSync(migrationFile)).toBe(true);
      const sql = fs.readFileSync(migrationFile, 'utf8');

      // Schema bounds checking
      expect(sql).toContain('char_length(trim(name)) between 1 and 100');
      expect(sql).toContain('char_length(trim(email)) between 3 and 255');
      expect(sql).toContain('char_length(trim(subject)) between 1 and 200');
      expect(sql).toContain('char_length(trim(message)) between 1 and 5000');
      expect(sql).toContain("status in ('NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED')");

      // RLS enabled
      expect(sql).toContain('alter table public.inquiries enable row level security;');

      // Public submissions are proxied through rate-limited Express; direct PostgREST access is denied.
      expect(sql).toContain('create policy "Service role can submit inquiries"');
      expect(sql).toContain('for insert');
      expect(sql).toContain("with check (auth.role() = 'service_role')");

      // Supabase Auth users have no direct access; Express uses the service-role client.
      expect(sql).toContain('revoke all on table public.inquiries from anon, authenticated;');
      expect(sql).toContain('create policy "Service role can view inquiries"');
      expect(sql).toContain('create policy "Service role can update inquiries"');
      expect(sql).toContain('create policy "Service role can delete inquiries"');

      // Only the service-role backend can manage inquiry records.
      expect(sql).toContain('grant all on table public.inquiries to service_role;');
    });

    it('storage migration does NOT attempt to create storage schema or tables', () => {
      const sql = fs.readFileSync(migrationFile, 'utf8');

      // Prohibit platform table creation
      expect(sql).not.toMatch(/\bcreate\s+schema\s+(if\s+not\s+exists\s+)?storage\b/i);
      expect(sql).not.toMatch(/\bcreate\s+table\s+(if\s+not\s+exists\s+)?storage\.buckets\b/i);
      expect(sql).not.toMatch(/\bcreate\s+table\s+(if\s+not\s+exists\s+)?storage\.objects\b/i);

      // Only configure existing bucket
      expect(sql).toContain("insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)");
      expect(sql).toContain("'product-images'");
      expect(sql).toContain('10485760'); // 10MB limit

      // Public read policy
      expect(sql).toContain('create policy "Public Access to product-images"');
      expect(sql).toContain('on storage.objects');
      expect(sql).toContain('for select');
      expect(sql).toContain("using (bucket_id = 'product-images');");

      // Mutation policy restricted strictly to service_role
      expect(sql).toContain('create policy "Service role manage product-images"');
      expect(sql).toContain("auth.role() = 'service_role'");
    });
  });
});
