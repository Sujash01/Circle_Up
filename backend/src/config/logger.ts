import pino from 'pino';
import { env } from './env.js';

/**
 * Structured Pino logger configured with automatic redaction of credentials,
 * cookies, and authorization headers.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'circleup-api',
    env: env.NODE_ENV,
  },
});

