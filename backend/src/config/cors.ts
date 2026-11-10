import type { CorsOptions } from 'cors';
import { env } from './env.js';

/**
 * Strict CORS configuration allowing only configured frontend origins with credentials.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow non-browser / same-origin server-to-server requests (e.g. Render health checks, Supertest)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
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

