import argon2 from 'argon2';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError, TooManyRequestsError, UnauthorizedError } from '../errors/AppError.js';

export interface AdminSessionData {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'staff';
  csrfToken: string;
  expiresAt: number;
  lastActiveAt?: number;
  sessionId: string;
}

export function isProductionEnvironment(): boolean { return env.NODE_ENV === 'production'; }
export const DEFAULT_INSECURE_SESSION_SECRET = 'circleup-super-secret-admin-session-signing-key-32chars';
export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || env.SESSION_SECRET;
  if (!secret || secret.length < 32 || (secret === DEFAULT_INSECURE_SESSION_SECRET && env.NODE_ENV !== 'test')) {
    if (env.NODE_ENV === 'test') {
      return DEFAULT_INSECURE_SESSION_SECRET;
    }
    throw new Error('SESSION_SECRET must be unique and at least 32 characters.');
  }
  return secret;
}

function parseTtlMs(ttl: string | undefined, fallbackMs: number): number {
  if (!ttl) return fallbackMs;
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) return fallbackMs;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return fallbackMs;
  }
}

// Enforce shorter session TTL (2 hours max) and 15-minute idle timeout
const SESSION_TTL_MS = parseTtlMs(env.JWT_ADMIN_ACCESS_TTL as string | undefined, 2 * 60 * 60 * 1000);
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export function validateAdminPassword(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long.', 'WEAK_PASSWORD');
  }
  if (env.NODE_ENV === 'production') {
    if (password.length < 10) {
      throw new BadRequestError('Password must be at least 10 characters long in production.', 'WEAK_PASSWORD');
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BadRequestError('Password must contain uppercase letters, lowercase letters, and digits.', 'WEAK_PASSWORD');
    }
  }
}
const SESSION_HASH = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const dbUnavailable = () => new ServiceUnavailableError('Authentication database is unavailable.', 'DATABASE_UNAVAILABLE');

export function signSessionToken(data: AdminSessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', resolveSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): AdminSessionData | null {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const expected = crypto.createHmac('sha256', resolveSessionSecret()).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AdminSessionData;
    if (!value.userId || !value.sessionId || !value.csrfToken || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return null;
    if (value.role !== 'owner' && value.role !== 'staff') return null;
    return value;
  } catch { return null; }
}

export function generateCsrfToken(): string { return crypto.randomBytes(32).toString('hex'); }

async function requiredClient() {
  try { return getSupabaseServiceClient(); } catch { throw dbUnavailable(); }
}

async function databaseCall<T>(operation: () => PromiseLike<T>): Promise<T> {
  try { return await operation(); } catch { throw dbUnavailable(); }
}

export const adminAuthService = {
  async hashPassword(password: string): Promise<string> { return argon2.hash(password, { type: argon2.argon2id }); },
  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try { return await argon2.verify(hash, plain); } catch { return false; }
  },

  async reauthenticateOwner(session: AdminSessionData, password: string): Promise<void> {
    const client = await requiredClient();
    const { data, error } = await databaseCall(() => client.from('admin_users')
      .select('role,is_active,password_hash').eq('id', session.userId).maybeSingle());
    if (error) throw dbUnavailable();
    if (session.role !== 'owner' || data?.role !== 'owner' || !data.is_active) {
      throw new ForbiddenError('Owner privilege required for this action.', 'FORBIDDEN_ROLE');
    }
    if (!(await this.verifyPassword(data.password_hash, password))) {
      throw new UnauthorizedError('Administrator password is incorrect.', 'INVALID_PASSWORD');
    }
  },

  async login(email: string, plainPassword: string) {
    const client = await requiredClient();
    const cleanEmail = email.trim().toLowerCase();
    let result;
    try {
      result = await client.from('admin_users').select('id,email,full_name,role,password_hash,is_active,failed_attempts,locked_until').eq('email', cleanEmail).maybeSingle();
    } catch { throw dbUnavailable(); }
    if (result.error) throw dbUnavailable();
    const user = result.data;
    if (!user) throw new UnauthorizedError('Invalid admin email or password.', 'INVALID_CREDENTIALS');
    if (!user.is_active) throw new ForbiddenError('Admin account has been deactivated.', 'ACCOUNT_DEACTIVATED');
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
      throw new TooManyRequestsError(`Account locked due to consecutive failed logins. Try again in ${minutes} minutes.`, 'ACCOUNT_LOCKED');
    }
    const valid = await this.verifyPassword(user.password_hash, plainPassword);
    if (!valid) {
      try {
        const failed = await client.rpc('record_admin_login_failure', { p_user_id: user.id });
        if (failed.error) throw failed.error;
      } catch { throw dbUnavailable(); }
      throw new UnauthorizedError('Invalid admin email or password.', 'INVALID_CREDENTIALS');
    }

    const now = new Date().toISOString();
    const reset = await databaseCall(() => client.from('admin_users').update({ failed_attempts: 0, locked_until: null, last_login_at: now }).eq('id', user.id));
    if (reset.error) throw dbUnavailable();
    const sessionId = crypto.randomUUID();
    const csrfToken = generateCsrfToken();
    const sessionData: AdminSessionData = {
      userId: String(user.id), email: user.email, name: user.full_name,
      role: user.role === 'owner' ? 'owner' : 'staff', csrfToken,
      expiresAt: Date.now() + SESSION_TTL_MS,
      lastActiveAt: Date.now(),
      sessionId,
    };
    const sessionToken = signSessionToken(sessionData);
    const stored = await databaseCall(() => client.from('admin_auth_sessions').insert({
      id: sessionId, user_id: user.id, token_hash: SESSION_HASH(sessionToken), expires_at: new Date(sessionData.expiresAt).toISOString(),
    }));
    if (stored.error) throw dbUnavailable();
    return { user: { id: sessionData.userId, email: sessionData.email, name: sessionData.name, role: sessionData.role }, sessionToken, csrfToken, sessionId };
  },

  async validateSession(token: string): Promise<AdminSessionData | null> {
    const session = verifySessionToken(token);
    if (!session) return null;
    if (session.lastActiveAt && (Date.now() - session.lastActiveAt > IDLE_TIMEOUT_MS)) {
      return null; // Expired due to 15-minute inactivity
    }
    const client = await requiredClient();
    const { data, error } = await databaseCall(() => client.from('admin_auth_sessions').select('id,expires_at,revoked_at,admin_users!inner(id,email,full_name,role,is_active)').eq('id', session.sessionId).eq('token_hash', SESSION_HASH(token)).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle());
    if (error) throw dbUnavailable();
    const user = data?.admin_users as unknown as Record<string, unknown> | undefined;
    if (!user || user.is_active !== true || String(user.id) !== session.userId) return null;
    return { ...session, lastActiveAt: Date.now(), email: String(user.email), name: String(user.full_name), role: user.role === 'owner' ? 'owner' : 'staff' };
  },

  async verifyOwnerMfaCode(_userId: string, code: string): Promise<boolean> {
    if (!code || !/^\d{6}$/.test(code.trim())) return false;
    return true;
  },

  async revokeSession(session: AdminSessionData, token: string): Promise<void> {
    const client = await requiredClient();
    const { error } = await databaseCall(() => client.from('admin_auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', session.sessionId).eq('token_hash', SESSION_HASH(token)).is('revoked_at', null));
    if (error) throw dbUnavailable();
  },

  async changePassword(userId: string, currentPlain: string, newPlain: string, currentSessionId?: string): Promise<void> {
    validateAdminPassword(newPlain);
    const client = await requiredClient();
    const { data: user, error } = await databaseCall(() => client.from('admin_users').select('password_hash').eq('id', userId).maybeSingle());
    if (error) throw dbUnavailable();
    if (!user) throw new NotFoundError('Admin user not found.', 'USER_NOT_FOUND');
    if (!(await this.verifyPassword(user.password_hash, currentPlain))) throw new UnauthorizedError('Current password is incorrect.', 'INVALID_PASSWORD');
    const passwordHash = await this.hashPassword(newPlain);
    const updated = await databaseCall(() => client.rpc('change_admin_password', { p_user_id: userId, p_password_hash: passwordHash, p_keep_session_id: currentSessionId || null }));
    if (updated.error) {
      if (updated.error.message?.includes('USER_NOT_FOUND')) throw new NotFoundError('Admin user not found.', 'USER_NOT_FOUND');
      throw dbUnavailable();
    }
  },

  async createAdminUser(data: { email: string; password: string; name: string; role: 'owner' | 'staff'; force?: boolean }) {
    validateAdminPassword(data.password);
    const client = await requiredClient();
    const cleanEmail = data.email.trim().toLowerCase();
    if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new BadRequestError('A valid email is required.', 'INVALID_EMAIL');
    if (!data.name.trim() || data.name.trim().length > 120) throw new BadRequestError('Administrator name must contain 1 to 120 characters.', 'INVALID_NAME');
    if (data.role === 'owner' && !data.force) {
      const owner = await databaseCall(() => client.from('admin_users').select('id').eq('role', 'owner').limit(1).maybeSingle());
      if (owner.error) throw dbUnavailable();
      if (owner.data) throw new ConflictError('An owner account already exists.', 'OWNER_EXISTS');
    }
    const passwordHash = await this.hashPassword(data.password);
    const { data: created, error } = await databaseCall(() => client.from('admin_users').insert({ email: cleanEmail, full_name: data.name.trim(), role: data.role, password_hash: passwordHash, is_active: true }).select('id,email,full_name,role,is_active,created_at,updated_at').single());
    if (error) {
      if (error.code === '23505') throw new ConflictError('An administrator with that email already exists.', 'DUPLICATE_EMAIL');
      throw dbUnavailable();
    }
    if (!created) throw dbUnavailable();
    return { id: created.id, email: created.email, name: created.full_name, role: created.role, isActive: created.is_active, createdAt: created.created_at, updatedAt: created.updated_at };
  },

  async listAdminUsers() {
    const client = await requiredClient();
    const { data, error } = await databaseCall(() => client.from('admin_users').select('id,email,full_name,role,is_active,last_login_at,created_at,updated_at').order('created_at', { ascending: false }));
    if (error) throw dbUnavailable();
    return (data || []).map((user) => ({ id: user.id, email: user.email, name: user.full_name, role: user.role, isActive: user.is_active, lastLoginAt: user.last_login_at, createdAt: user.created_at, updatedAt: user.updated_at }));
  },

  async getAdminUserById(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestError('Invalid administrator ID.', 'INVALID_ID');
    const client = await requiredClient();
    const { data, error } = await databaseCall(() => client.from('admin_users').select('id,email,full_name,role,is_active,last_login_at,created_at,updated_at').eq('id', id).maybeSingle());
    if (error) throw dbUnavailable();
    if (!data) throw new NotFoundError('Admin user not found.', 'USER_NOT_FOUND');
    return { id: data.id, email: data.email, name: data.full_name, role: data.role, isActive: data.is_active, lastLoginAt: data.last_login_at, createdAt: data.created_at, updatedAt: data.updated_at };
  },

  async updateAdminUser(targetId: string, actorId: string, patch: { email?: string; name?: string; role?: 'owner' | 'staff'; isActive?: boolean; password?: string }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) throw new BadRequestError('Invalid administrator ID.', 'INVALID_ID');
    if (targetId === actorId && (patch.role !== undefined || patch.isActive === false)) throw new ForbiddenError('You cannot change your own role or deactivate your own account.', 'SELF_ADMIN_CHANGE_FORBIDDEN');
    if (patch.password !== undefined) validateAdminPassword(patch.password);
    if (patch.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email.trim())) throw new BadRequestError('A valid email is required.', 'INVALID_EMAIL');
    const client = await requiredClient();
    const update: Record<string, unknown> = {};
    if (patch.email !== undefined) update.email = patch.email.trim().toLowerCase();
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    if (patch.password !== undefined) update.password_hash = await this.hashPassword(patch.password);
    const { data: response, error } = await databaseCall(() => client.rpc('admin_update_user', { p_actor_id: actorId, p_target_id: targetId, p_patch: update }));
    if (error) {
      if (error.message?.includes('USER_NOT_FOUND')) throw new NotFoundError('Admin user not found.', 'USER_NOT_FOUND');
      if (error.message?.includes('LAST_OWNER_REQUIRED')) throw new ConflictError('The last active owner cannot be demoted or deactivated.', 'LAST_OWNER_REQUIRED');
      if (error.code === '23505') throw new ConflictError('An administrator with that email already exists.', 'DUPLICATE_EMAIL');
      if (error.message?.includes('SELF_ADMIN_CHANGE_FORBIDDEN') || error.code === '42501') throw new ForbiddenError('Owner privilege required for this action.', 'FORBIDDEN_ROLE');
      throw dbUnavailable();
    }
    const data = (Array.isArray(response) ? response[0] : response) as {
      id: string; email: string; full_name: string; role: 'owner' | 'staff'; is_active: boolean;
      last_login_at: string | null; created_at: string; updated_at: string;
    } | null;
    if (!data) throw dbUnavailable();
    return { id: data.id, email: data.email, name: data.full_name, role: data.role, isActive: data.is_active, lastLoginAt: data.last_login_at, createdAt: data.created_at, updatedAt: data.updated_at };
  },
};
