import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { adminAuthService, type AdminSessionData } from '../services/adminAuth.service.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminSessionData;
    }
  }
}

export function requireAdminAuth(allowedRole?: 'owner' | 'staff') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Read session from signed cookie or Bearer token
    const token =
      req.cookies?.admin_session ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      return next(new UnauthorizedError('Admin authentication required.', 'UNAUTHORIZED'));
    }

    void adminAuthService.validateSession(token).then((session) => {
      if (!session) return next(new UnauthorizedError('Invalid, expired, or revoked admin session.', 'INVALID_SESSION'));
      if (allowedRole === 'owner' && session.role !== 'owner') return next(new ForbiddenError('Owner privilege required for this action.', 'FORBIDDEN_ROLE'));
      req.adminUser = session;
      next();
    }).catch(next);
  };
}

export function optionalAdminAuth(req: Request, _res: Response, next: NextFunction): void {
  const token =
    req.cookies?.admin_session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (token) {
    void adminAuthService.validateSession(token).then((session) => { if (session) req.adminUser = session; }).then(() => next()).catch(next);
    return;
  }
  next();
}

export function verifyAdminCsrf(req: Request, _res: Response, next: NextFunction): void {
  // Safe HTTP read methods skip CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // State-changing methods require matching X-CSRF-Token
  const headerToken = req.headers['x-csrf-token'];
  const sessionToken = req.adminUser?.csrfToken;

  if (typeof headerToken !== 'string' || typeof sessionToken !== 'string') {
    return next(
      new ForbiddenError(
        'Invalid or missing CSRF token. Include X-CSRF-Token header.',
        'INVALID_CSRF_TOKEN',
      ),
    );
  }

  const headerBuf = Buffer.from(headerToken);
  const sessionBuf = Buffer.from(sessionToken);

  if (headerBuf.length !== sessionBuf.length || !crypto.timingSafeEqual(headerBuf, sessionBuf)) {
    return next(
      new ForbiddenError(
        'Invalid or missing CSRF token. Include X-CSRF-Token header.',
        'INVALID_CSRF_TOKEN',
      ),
    );
  }

  next();
}

