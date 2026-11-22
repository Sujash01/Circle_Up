import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authDb = vi.hoisted(() => {
  let user: Record<string, unknown> | null = null;
  let session: Record<string, unknown> | null = null;
  let available = true;
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const builder: Record<string, (...args: any[]) => any> = {};
  let table = '';
  const chain = () => builder;
  Object.assign(builder, {
    select: chain, eq: chain, is: chain, gt: chain, order: chain, limit: chain,
    update: (values: Record<string, unknown>) => { if (table === 'admin_users' && user) Object.assign(user, values); if (table === 'admin_auth_sessions' && session) Object.assign(session, values); return builder; },
    insert: (values: Record<string, unknown>) => { if (table === 'admin_auth_sessions') session = { ...values, revoked_at: null, admin_users: user }; return builder; },
    maybeSingle: async () => ({ data: table === 'admin_users' ? user : (session?.revoked_at ? null : session), error: null }),
    single: async () => ({ data: user, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
  });
  return {
    rpcCalls,
    setUser: (value: Record<string, unknown> | null) => { user = value; },
    setSession: (value: Record<string, unknown> | null) => { session = value; },
    setAvailable: (value: boolean) => { available = value; },
    client: {
      from: (name: string) => { if (!available) throw new Error('offline'); table = name; return builder; },
      rpc: async (name: string, params: Record<string, unknown>) => { rpcCalls.push({ name, params }); return available ? { data: null, error: null } : { data: null, error: { message: 'offline' } }; },
    },
    reset: () => { user = null; session = null; available = true; rpcCalls.length = 0; },
  };
});

vi.mock('../../src/config/supabase.js', () => ({ getSupabaseServiceClient: () => {
  if (!(authDb.client as { from: (table: string) => unknown }).from) throw new Error('offline');
  return authDb.client;
} }));

import { adminAuthService, signSessionToken, verifySessionToken } from '../../src/services/adminAuth.service.js';
import { UnauthorizedError } from '../../src/errors/AppError.js';

describe('Supabase-only admin authentication', () => {
  beforeEach(() => authDb.reset());
  afterEach(() => vi.restoreAllMocks());

  it('fails closed when Supabase is unavailable, including for former demo credentials', async () => {
    authDb.setAvailable(false);
    await expect(adminAuthService.login('owner@circleuponline.com', 'OwnerPassword123')).rejects.toMatchObject({
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
    });
  });

  it('uses Argon2id password hashes and rejects incorrect passwords', async () => {
    const hash = await adminAuthService.hashPassword('a-long-test-password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(adminAuthService.verifyPassword(hash, 'incorrect-password')).resolves.toBe(false);
    await expect(adminAuthService.verifyPassword(hash, 'a-long-test-password')).resolves.toBe(true);
  });

  it('authenticates a persisted user, resets lockout state, and creates a hashed revocable session', async () => {
    const passwordHash = await adminAuthService.hashPassword('a-long-test-password');
    authDb.setUser({ id: '43b92f3c-38ba-4aa2-b840-4965125fe876', email: 'owner@example.com', full_name: 'Owner', role: 'owner', password_hash: passwordHash, is_active: true, failed_attempts: 2, locked_until: null });
    const login = await adminAuthService.login('OWNER@example.com', 'a-long-test-password');
    expect(login.user.role).toBe('owner');
    expect(login.sessionToken).toBeTruthy();
    expect(verifySessionToken(login.sessionToken)?.userId).toBe('43b92f3c-38ba-4aa2-b840-4965125fe876');
    await expect(adminAuthService.validateSession(login.sessionToken)).resolves.toMatchObject({ role: 'owner' });
    await adminAuthService.revokeSession(verifySessionToken(login.sessionToken)!, login.sessionToken);
    await expect(adminAuthService.validateSession(login.sessionToken)).resolves.toBeNull();
  });

  it('records failed attempts through the lockout RPC and does not create sessions on failure', async () => {
    const passwordHash = await adminAuthService.hashPassword('a-long-test-password');
    authDb.setUser({ id: '43b92f3c-38ba-4aa2-b840-4965125fe876', email: 'owner@example.com', full_name: 'Owner', role: 'owner', password_hash: passwordHash, is_active: true });
    await expect(adminAuthService.login('owner@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(authDb.rpcCalls[0]?.name).toBe('record_admin_login_failure');
    expect(verifySessionToken('')).toBeNull();
  });

  it('rejects locked and deactivated accounts before password verification', async () => {
    authDb.setUser({ id: '43b92f3c-38ba-4aa2-b840-4965125fe876', email: 'owner@example.com', full_name: 'Owner', role: 'owner', password_hash: 'unused', is_active: true, locked_until: new Date(Date.now() + 60_000).toISOString() });
    await expect(adminAuthService.login('owner@example.com', 'wrong')).rejects.toMatchObject({ statusCode: 429, code: 'ACCOUNT_LOCKED' });
    authDb.setUser({ id: '43b92f3c-38ba-4aa2-b840-4965125fe876', email: 'owner@example.com', full_name: 'Owner', role: 'owner', password_hash: 'unused', is_active: false });
    await expect(adminAuthService.login('owner@example.com', 'wrong')).rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_DEACTIVATED' });
  });

  it('changes passwords through an atomic RPC and keeps only the current session', async () => {
    const passwordHash = await adminAuthService.hashPassword('current-password-123');
    authDb.setUser({ id: '43b92f3c-38ba-4aa2-b840-4965125fe876', email: 'owner@example.com', full_name: 'Owner', role: 'owner', password_hash: passwordHash, is_active: true });
    await adminAuthService.changePassword('43b92f3c-38ba-4aa2-b840-4965125fe876', 'current-password-123', 'replacement-password-123', 'b3b92f3c-38ba-4aa2-b840-4965125fe876');
    expect(authDb.rpcCalls[0]?.name).toBe('change_admin_password');
    expect(authDb.rpcCalls[0]?.params.p_keep_session_id).toBe('b3b92f3c-38ba-4aa2-b840-4965125fe876');
    expect(String(authDb.rpcCalls[0]?.params.p_password_hash)).toMatch(/^\$argon2id\$/);
    expect(authDb.rpcCalls[0]?.params.p_password_hash).not.toBe('replacement-password-123');
  });

  it('prevents self role changes before any database write', async () => {
    await expect(adminAuthService.updateAdminUser('43b92f3c-38ba-4aa2-b840-4965125fe876', '43b92f3c-38ba-4aa2-b840-4965125fe876', { role: 'staff' })).rejects.toMatchObject({ code: 'SELF_ADMIN_CHANGE_FORBIDDEN' });
  });

  it('rejects malformed, tampered and expired signed sessions', () => {
    const token = signSessionToken({ userId: 'admin-1', email: 'owner@example.com', name: 'Owner', role: 'owner', csrfToken: 'csrf', expiresAt: Date.now() + 60_000, sessionId: 'session-1' });
    expect(verifySessionToken(token)?.sessionId).toBe('session-1');
    expect(verifySessionToken(`${token}x`)).toBeNull();
    const expired = signSessionToken({ userId: 'admin-1', email: 'owner@example.com', name: 'Owner', role: 'owner', csrfToken: 'csrf', expiresAt: Date.now() - 1, sessionId: 'session-2' });
    expect(verifySessionToken(expired)).toBeNull();
  });
});
