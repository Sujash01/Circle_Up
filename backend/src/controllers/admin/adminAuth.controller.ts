import type { Request, Response, NextFunction } from 'express';
import { adminAuthService, IDLE_TIMEOUT_MS, SESSION_TTL_MS } from '../../services/adminAuth.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { adminLoginSchema } from '@circleup/shared';
import { z } from 'zod';

const adminCreateSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(256),
  role: z.enum(['owner', 'staff']).default('staff'),
  permissions: z.array(z.string()).optional(),
}).strict();
const adminUpdateSchema = z.object({
  email: z.string().email().max(254).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['owner', 'staff']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(256).optional(),
  permissions: z.array(z.string()).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(8).max(256) }).strict();

export const adminAuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = adminLoginSchema.parse(req.body);
      const result = await adminAuthService.login(parsed.email, parsed.password);

      // Set HttpOnly, Secure session cookie with SameSite: 'lax'
      res.cookie('admin_session', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL_MS,
        path: '/',
      });

      try {
        await auditService.record({
          actor: {
            userId: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role as 'owner' | 'staff',
            permissions: result.user.permissions || [],
            csrfToken: result.csrfToken,
            expiresAt: Date.now() + SESSION_TTL_MS,
            sessionId: result.sessionId,
          },
          action: 'ADMIN_LOGIN',
          entity: 'AdminUser',
          entityId: result.user.id,
          req,
        });
      } catch {
        // Non-blocking audit record failure during login
      }

      const now = Date.now();
      return sendSuccess(res, {
        user: result.user,
        csrfToken: result.csrfToken,
        session: {
          expiresAt: now + SESSION_TTL_MS,
          idleTimeoutMs: IDLE_TIMEOUT_MS,
          idleExpiresAt: now + IDLE_TIMEOUT_MS,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.admin_session || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '');
      res.clearCookie('admin_session', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      if (req.adminUser && token) await adminAuthService.revokeSession(req.adminUser, token);
      if (req.adminUser) {
        await auditService.record({
          actor: req.adminUser,
          action: 'ADMIN_LOGOUT',
          entity: 'AdminUser',
          entityId: req.adminUser.userId,
          req,
        });
      }
      return sendSuccess(res, { message: 'Signed out successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const lastActiveAt = req.adminUser?.lastActiveAt || Date.now();
      return sendSuccess(res, {
        user: {
          id: req.adminUser?.userId,
          email: req.adminUser?.email,
          name: req.adminUser?.name,
          role: req.adminUser?.role,
          permissions: req.adminUser?.permissions || [],
        },
        csrfToken: req.adminUser?.csrfToken,
        session: req.adminUser
          ? {
              expiresAt: req.adminUser.expiresAt,
              idleTimeoutMs: IDLE_TIMEOUT_MS,
              idleExpiresAt: lastActiveAt + IDLE_TIMEOUT_MS,
            }
          : undefined,
      });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.adminUser!.userId;
      const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);
      await adminAuthService.changePassword(userId, currentPassword, newPassword, req.adminUser!.sessionId);

      await auditService.record({
        actor: req.adminUser,
        action: 'CHANGE_PASSWORD',
        entity: 'AdminUser',
        entityId: userId,
        req,
      });

      return sendSuccess(res, { message: 'Password changed successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async listUsers(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await adminAuthService.listAdminUsers()); } catch (error) { next(error); }
  },

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return sendSuccess(res, await adminAuthService.getAdminUserById(id));
    } catch (error) { next(error); }
  },

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const input = adminCreateSchema.parse(req.body);
      const created = await adminAuthService.createAdminUser(input);
      await auditService.record({ actor: req.adminUser, action: 'ADMIN_USER_CREATE', entity: 'AdminUser', entityId: created.id, diff: { email: created.email, role: created.role }, req });
      return sendCreated(res, created);
    } catch (error) { next(error); }
  },

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const input = adminUpdateSchema.parse(req.body);
      const updated = await adminAuthService.updateAdminUser(id, req.adminUser!.userId, input);
      const safeDiff = { email: input.email, name: input.name, role: input.role, isActive: input.isActive, permissions: input.permissions };
      await auditService.record({ actor: req.adminUser, action: 'ADMIN_USER_UPDATE', entity: 'AdminUser', entityId: updated.id, diff: safeDiff, req });
      return sendSuccess(res, updated);
    } catch (error) { next(error); }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const result = await adminAuthService.deleteAdminUser(id, req.adminUser!.userId);
      await auditService.record({
        actor: req.adminUser,
        action: 'ADMIN_USER_DELETE',
        entity: 'AdminUser',
        entityId: id,
        req,
      });
      return sendSuccess(res, result);
    } catch (error) { next(error); }
  },
};

