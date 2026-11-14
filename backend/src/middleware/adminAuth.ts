import type { Request, Response, NextFunction } from 'express';
import { verifySessionToken, type AdminSessionData } from '../services/adminAuth.service.js';
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

    const session = verifySessionToken(token);
    if (!session) {
      return next(new UnauthorizedError('Invalid or expired admin session.', 'INVALID_SESSION'));
    }

    if (allowedRole === 'owner' && session.role !== 'owner') {
      return next(new ForbiddenError('Owner privilege required for this action.', 'FORBIDDEN_ROLE'));
    }

    req.adminUser = session;
    next();
  };
}

export function verifyAdminCsrf(req: Request, _res: Response, next: NextFunction): void {
  // Safe HTTP read methods skip CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // State-changing methods require matching X-CSRF-Token
  const headerToken = req.headers['x-csrf-token'];
  const sessionToken = req.adminUser?.csrfToken;

  if (!headerToken || !sessionToken || headerToken !== sessionToken) {
    return next(
      new ForbiddenError(
        'Invalid or missing CSRF token. Include X-CSRF-Token header.',
        'INVALID_CSRF_TOKEN',
      ),
    );
  }

  next();
}
