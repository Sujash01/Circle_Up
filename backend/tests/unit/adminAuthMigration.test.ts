import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../../supabase/migrations/20261131_admin_auth_sessions.sql', import.meta.url), 'utf8').toLowerCase();

describe('admin auth schema migration', () => {
  it('preserves owner/staff roles, lockout fields, and hashed revocable sessions', () => {
    expect(migration).toContain('failed_attempts integer not null default 0');
    expect(migration).toContain('locked_until timestamptz');
    expect(migration).toContain("check (role in ('owner', 'staff'))");
    expect(migration).toContain("set role = 'staff' where role = 'admin'");
    expect(migration).toContain('token_hash text not null unique');
    expect(migration).toContain("token_hash ~ '^[a-f0-9]{64}$'");
    expect(migration).toContain('revoked_at timestamptz');
    expect(migration).toContain('enable row level security');
    expect(migration).not.toContain('session_token text');
    expect(migration).not.toContain('password text');
  });

  it('limits lockout and user-management RPC execution to service_role', () => {
    expect(migration).toContain('record_admin_login_failure');
    expect(migration).toContain('admin_update_user');
    expect(migration).toContain('change_admin_password');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('revoke all on public.admin_users from public, anon, authenticated, service_role');
    expect(migration).toContain('grant select, insert, update on public.admin_users to service_role');
    expect(migration).toContain('security invoker');
    expect(migration).toContain("interval '15 minutes'");
  });
});
