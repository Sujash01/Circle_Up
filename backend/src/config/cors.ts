import type { CorsOptions } from 'cors';
import { env } from './env.js';

function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>(env.CORS_ALLOWED_ORIGINS);
  if (env.FRONTEND_URL) {
    allowed.add(env.FRONTEND_URL);
  }
  for (const host of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    if (host) {
      allowed.add(host.startsWith('http') ? host : `https://${host}`);
    }
  }
  return allowed;
}

/**
 * Strict CORS configuration allowing configured frontend & Vercel deployment origins with credentials.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow non-browser / same-origin server-to-server requests (e.g. Render health checks, Supertest)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (getAllowedOrigins().has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Guest-Cart-Id',
    'X-Request-Id',
  ],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
};

