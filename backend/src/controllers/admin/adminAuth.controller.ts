import type { Request, Response, NextFunction } from 'express';
import { adminAuthService } from '../../services/adminAuth.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { adminLoginSchema } from '@circleup/shared';

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
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      await auditService.record({
        actor: {
          userId: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role as 'owner' | 'staff',
          csrfToken: result.csrfToken,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        },
        action: 'ADMIN_LOGIN',
        entity: 'AdminUser',
        entityId: result.user.id,
        req,
      });

      return sendSuccess(res, {
        user: result.user,
        csrfToken: result.csrfToken,
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      res.clearCookie('admin_session', { path: '/' });
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
      return sendSuccess(res, {
        user: {
          id: req.adminUser?.userId,
          email: req.adminUser?.email,
          name: req.adminUser?.name,
          role: req.adminUser?.role,
        },
        csrfToken: req.adminUser?.csrfToken,
      });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.adminUser!.userId;
      const { currentPassword, newPassword } = req.body;
      await adminAuthService.changePassword(userId, currentPassword, newPassword);

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
};

