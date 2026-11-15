import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/AppError.js';

export interface VerifiedCustomer {
  id: string;
  email?: string;
  phone?: string;
  role?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: VerifiedCustomer;
    }
  }
}

/**
 * Resolves the secret used to verify customer/Supabase JWTs.
 * Enforces strict environment secret in production with no insecure fallbacks.
 */
function getCustomerJwtSecret(): string | null {
  if (env.SUPABASE_JWT_SECRET) return env.SUPABASE_JWT_SECRET;
  if (env.JWT_ACCESS_SECRET) return env.JWT_ACCESS_SECRET;
  if (env.NODE_ENV === 'production') return null;
  return 'circleup-customer-jwt-secret-at-least-32-chars';
}

/**
 * Cryptographically verifies a Supabase / customer JWT.
 * Never merely decodes or trusts unverified payload.
 */
export async function verifyCustomerJwt(token: string): Promise<VerifiedCustomer> {
  // Inspect token header to detect signing algorithm
  let headerAlg = 'HS256';
  try {
    const decodedWithHeader = jwt.decode(token, { complete: true }) as {
      header?: { alg?: string };
    } | null;
    if (decodedWithHeader?.header?.alg) {
      headerAlg = decodedWithHeader.header.alg;
    }
  } catch {
    throw new UnauthorizedError('Malformed authentication token.', 'INVALID_TOKEN');
  }

  // 1. If token is signed with HS256, verify signature with project secret
  if (headerAlg === 'HS256') {
    const secret = getCustomerJwtSecret();
    if (secret) {
      try {
        const decoded = jwt.verify(token, secret, {
          algorithms: ['HS256'],
          audience: 'authenticated',
        }) as {
          sub?: string;
          email?: string;
          phone?: string;
          role?: string;
          aud?: string | string[];
        };

        if (!decoded.sub) {
          throw new UnauthorizedError('Invalid token: missing subject identity.', 'INVALID_TOKEN');
        }

        return {
          id: String(decoded.sub),
          email: decoded.email,
          phone: decoded.phone,
          role: decoded.role,
        };
      } catch (err: unknown) {
        if (err instanceof jwt.TokenExpiredError) {
          throw new UnauthorizedError('Authentication token has expired. Please sign in again.', 'TOKEN_EXPIRED');
        }

        // If HS256 failed locally and remote Supabase URL is available, attempt remote fallback
        if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
          try {
            const authUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
            const res = await fetch(authUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: env.SUPABASE_ANON_KEY,
              },
            });

            if (res.ok) {
              const user = (await res.json()) as { id: string; email?: string; phone?: string; role?: string };
              if (user?.id) {
                return {
                  id: String(user.id),
                  email: user.email,
                  phone: user.phone,
                  role: user.role,
                };
              }
            }
          } catch {
            // Fall through
          }
        }

        throw new UnauthorizedError('Invalid authentication token signature.', 'INVALID_TOKEN');
      }
    }
  }

  // 2. If token is signed with asymmetric algorithm (RS256, ES256) or JWKS
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const authUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
      const res = await fetch(authUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_ANON_KEY,
        },
      });

      if (res.ok) {
        const user = (await res.json()) as { id: string; email?: string; phone?: string; role?: string };
        if (user?.id) {
          return {
            id: String(user.id),
            email: user.email,
            phone: user.phone,
            role: user.role,
          };
        }
      }
    } catch {
      // Fall through
    }
  }

  throw new UnauthorizedError(
    `Unsupported or unverified token algorithm "${headerAlg}".`,
    'INVALID_TOKEN',
  );
}

/**
 * Middleware: Strictly requires authenticated customer with valid verified JWT.
 */
export async function requireCustomerAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Customer authentication token required.', 'UNAUTHORIZED'));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(new UnauthorizedError('Empty authorization bearer token.', 'UNAUTHORIZED'));
  }

  try {
    const verified = await verifyCustomerJwt(token);
    req.customer = verified;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: Optionally verifies customer JWT if provided.
 * If header is provided, it must be valid (rejecting tampered/expired tokens).
 * If no header is present, proceeds with req.customer undefined (for guest checkout).
 */
export async function optionalCustomerAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // If caller is already authenticated as admin, skip customer token verification
  if (req.adminUser) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next();
  }

  try {
    const verified = await verifyCustomerJwt(token);
    req.customer = verified;
    next();
  } catch (err) {
    next(err);
  }
}
