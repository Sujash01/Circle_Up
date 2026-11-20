import argon2 from 'argon2';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { AdminUser, type IAdminUserDocument } from '../models/AdminUser.js';
import { env } from '../config/env.js';
import { isSupabaseBackendConfigured, getSupabaseServiceClient } from '../config/supabase.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../errors/AppError.js';

export interface AdminSessionData {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'staff';
  csrfToken: string;
  expiresAt: number;
}

// In-memory session store / mock fallback for offline or serverless testing
const IN_MEMORY_SESSIONS = new Map<string, AdminSessionData>();

// In-memory mock admin users for offline or test mode when MongoDB is disconnected
const MOCK_ADMIN_USERS: Array<Record<string, unknown>> = [];

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production';
}

export const DEFAULT_INSECURE_SESSION_SECRET = 'circleup-super-secret-admin-session-signing-key-32chars';

export function resolveSessionSecret(): string {
  if (isProductionEnvironment()) {
    const secret = process.env.SESSION_SECRET || env.SESSION_SECRET;
    if (
      !secret ||
      secret === DEFAULT_INSECURE_SESSION_SECRET ||
      secret.length < 32
    ) {
      throw new Error(
        'Fatal Security Configuration: SESSION_SECRET is missing, default, or under 32 characters in production.',
      );
    }
    return secret;
  }
  return env.SESSION_SECRET || DEFAULT_INSECURE_SESSION_SECRET;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function signSessionToken(data: AdminSessionData): string {
  const secret = resolveSessionSecret();
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): AdminSessionData | null {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const secret = resolveSessionSecret();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const data: AdminSessionData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > data.expiresAt) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const adminAuthService = {
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  },

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  },

  async login(email: string, plainPassword: string): Promise<{
    user: { id: string; email: string; name: string; role: string };
    sessionToken: string;
    csrfToken: string;
  }> {
    const cleanEmail = email.trim().toLowerCase();

    if (!isDbConnected()) {
      if (isProductionEnvironment()) {
        throw new ServiceUnavailableError(
          'Authentication service is temporarily unavailable. Database connection is offline.',
          'DATABASE_UNAVAILABLE',
        );
      }

      // Degraded / testing mode: resolve from MOCK_ADMIN_USERS
      let mock = MOCK_ADMIN_USERS.find((u) => u.email === cleanEmail);
      if (!mock && cleanEmail === 'owner@circleuponline.com') {
        mock = {
          id: 'owner-default-01',
          email: 'owner@circleuponline.com',
          name: 'CircleUp Owner',
          passwordHash: await this.hashPassword('OwnerPassword123'),
          role: 'owner',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        MOCK_ADMIN_USERS.push(mock);
      }
      if (!mock && cleanEmail === 'staff@circleuponline.com') {
        mock = {
          id: 'staff-default-01',
          email: 'staff@circleuponline.com',
          name: 'CircleUp Staff',
          passwordHash: await this.hashPassword('StaffPassword123'),
          role: 'staff',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        MOCK_ADMIN_USERS.push(mock);
      }

      if (!mock || !(await this.verifyPassword(String(mock.passwordHash), plainPassword))) {
        throw new UnauthorizedError('Invalid admin email or password.', 'INVALID_CREDENTIALS');
      }

      const csrfToken = generateCsrfToken();
      const sessionData: AdminSessionData = {
        userId: String(mock.id),
        email: String(mock.email),
        name: String(mock.name),
        role: mock.role as 'owner' | 'staff',
        csrfToken,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };

      const sessionToken = signSessionToken(sessionData);
      IN_MEMORY_SESSIONS.set(sessionToken, sessionData);

      return {
        user: {
          id: sessionData.userId,
          email: sessionData.email,
          name: sessionData.name,
          role: sessionData.role,
        },
        sessionToken,
        csrfToken,
      };
    }

    const user = await AdminUser.findOne({ email: cleanEmail });
    if (!user) {
      if (isSupabaseBackendConfigured()) {
        try {
          const { data: supaUser } = await getSupabaseServiceClient()
            .from('admin_users')
            .select('*')
            .eq('email', cleanEmail)
            .maybeSingle();
          if (supaUser && supaUser.is_active) {
            const valid = await this.verifyPassword(supaUser.password_hash, plainPassword);
            if (valid) {
              const csrfToken = generateCsrfToken();
              const sessionData: AdminSessionData = {
                userId: String(supaUser.id),
                email: supaUser.email,
                name: supaUser.name,
                role: supaUser.role as 'owner' | 'staff',
                csrfToken,
                expiresAt: Date.now() + SESSION_TTL_MS,
              };
              const sessionToken = signSessionToken(sessionData);
              IN_MEMORY_SESSIONS.set(sessionToken, sessionData);
              return {
                user: {
                  id: sessionData.userId,
                  email: sessionData.email,
                  name: sessionData.name,
                  role: sessionData.role,
                },
                sessionToken,
                csrfToken,
              };
            }
          }
        } catch {
          // Continue to fallback
        }
      }

      // Allow demo credentials in development if MongoDB collection has not been seeded
      if (!isProductionEnvironment()) {
        if (cleanEmail === 'owner@circleuponline.com' && plainPassword === 'OwnerPassword123') {
          const csrfToken = generateCsrfToken();
          const sessionData: AdminSessionData = {
            userId: 'owner-default-01',
            email: 'owner@circleuponline.com',
            name: 'CircleUp Owner',
            role: 'owner',
            csrfToken,
            expiresAt: Date.now() + SESSION_TTL_MS,
          };
          const sessionToken = signSessionToken(sessionData);
          IN_MEMORY_SESSIONS.set(sessionToken, sessionData);
          return {
            user: {
              id: sessionData.userId,
              email: sessionData.email,
              name: sessionData.name,
              role: sessionData.role,
            },
            sessionToken,
            csrfToken,
          };
        }
        if (cleanEmail === 'staff@circleuponline.com' && plainPassword === 'StaffPassword123') {
          const csrfToken = generateCsrfToken();
          const sessionData: AdminSessionData = {
            userId: 'staff-default-01',
            email: 'staff@circleuponline.com',
            name: 'CircleUp Staff',
            role: 'staff',
            csrfToken,
            expiresAt: Date.now() + SESSION_TTL_MS,
          };
          const sessionToken = signSessionToken(sessionData);
          IN_MEMORY_SESSIONS.set(sessionToken, sessionData);
          return {
            user: {
              id: sessionData.userId,
              email: sessionData.email,
              name: sessionData.name,
              role: sessionData.role,
            },
            sessionToken,
            csrfToken,
          };
        }
      }

      throw new UnauthorizedError('Invalid admin email or password.', 'INVALID_CREDENTIALS');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      throw new TooManyRequestsError(
        `Account locked due to consecutive failed logins. Try again in ${waitMin} minutes.`,
      );
    }

    if (!user.isActive) {
      throw new ForbiddenError('Admin account has been deactivated.', 'ACCOUNT_DEACTIVATED');
    }

    const isValid = await this.verifyPassword(user.passwordHash, plainPassword);
    if (!isValid) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lockout
        user.failedAttempts = 0;
      }
      await user.save();
      throw new UnauthorizedError('Invalid admin email or password.', 'INVALID_CREDENTIALS');
    }

    // Reset failed attempts on success
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const csrfToken = generateCsrfToken();
    const sessionData: AdminSessionData = {
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      csrfToken,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    const sessionToken = signSessionToken(sessionData);
    IN_MEMORY_SESSIONS.set(sessionToken, sessionData);

    return {
      user: {
        id: sessionData.userId,
        email: sessionData.email,
        name: sessionData.name,
        role: sessionData.role,
      },
      sessionToken,
      csrfToken,
    };
  },

  async createAdminUser(data: {
    email: string;
    password: string;
    name: string;
    role: 'owner' | 'staff';
    force?: boolean;
  }): Promise<IAdminUserDocument | Record<string, unknown>> {
    const cleanEmail = data.email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(data.password);

    if (!isDbConnected()) {
      if (isProductionEnvironment()) {
        throw new ServiceUnavailableError(
          'Database connection is offline. Cannot create admin user.',
          'DATABASE_UNAVAILABLE',
        );
      }
      const existing = MOCK_ADMIN_USERS.find((u) => u.email === cleanEmail);
      if (existing) {
        throw new BadRequestError(`Admin with email ${cleanEmail} already exists.`, 'DUPLICATE_EMAIL');
      }
      const mock = {
        id: `admin-${Date.now()}`,
        email: cleanEmail,
        name: data.name,
        passwordHash,
        role: data.role,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      MOCK_ADMIN_USERS.push(mock);
      return mock;
    }

    if (data.role === 'owner' && !data.force) {
      const existingOwner = await AdminUser.findOne({ role: 'owner' });
      if (existingOwner) {
        throw new BadRequestError(
          'An owner account already exists. Pass --force to create another owner.',
          'OWNER_EXISTS',
        );
      }
    }

    const existingUser = await AdminUser.findOne({ email: cleanEmail });
    if (existingUser) {
      throw new BadRequestError(`Admin with email ${cleanEmail} already exists.`, 'DUPLICATE_EMAIL');
    }

    return AdminUser.create({
      email: cleanEmail,
      passwordHash,
      name: data.name,
      role: data.role,
      isActive: true,
    });
  },

  async changePassword(userId: string, currentPlain: string, newPlain: string): Promise<void> {
    if (newPlain.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters.', 'WEAK_PASSWORD');
    }

    if (!isDbConnected()) {
      if (isProductionEnvironment()) {
        throw new ServiceUnavailableError(
          'Database connection is offline. Cannot change password.',
          'DATABASE_UNAVAILABLE',
        );
      }
      const mock = MOCK_ADMIN_USERS.find((u) => u.id === userId);
      if (!mock) throw new NotFoundError('Admin user not found', 'USER_NOT_FOUND');
      const valid = await this.verifyPassword(String(mock.passwordHash), currentPlain);
      if (!valid) throw new UnauthorizedError('Current password is incorrect.', 'INVALID_PASSWORD');
      mock.passwordHash = await this.hashPassword(newPlain);
      return;
    }

    const user = await AdminUser.findById(userId);
    if (!user) throw new NotFoundError('Admin user not found', 'USER_NOT_FOUND');

    const valid = await this.verifyPassword(user.passwordHash, currentPlain);
    if (!valid) throw new UnauthorizedError('Current password is incorrect.', 'INVALID_PASSWORD');

    user.passwordHash = await this.hashPassword(newPlain);
    await user.save();
  },
};

