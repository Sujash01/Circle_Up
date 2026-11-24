import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '../../.env');

// Load backend/.env regardless of whether the process is started from repo root or backend/.
dotenv.config({ path: backendEnvPath });
dotenv.config();

export const strictBooleanEnvSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((val, ctx) => {
    if (typeof val === 'boolean') return val;
    if (val === undefined || val === null || val.trim() === '') return false;
    const normalized = val.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid boolean environment variable: expected "true" or "false", received "${val}"`,
    });
    return false;
  });

const INSECURE_SECRET_PLACEHOLDERS = new Set([
  'circleup-super-secret-admin-session-signing-key-32chars',
  'circleup-guest-order-token-secret-at-least-32-chars',
  'circleup-customer-jwt-secret-at-least-32-chars',
  'replace-with-a-secure-random-secret-at-least-32-chars',
  'replace-with-32-plus-char-customer-access-secret',
  'replace-with-32-plus-char-admin-access-secret',
  'replace-with-32-plus-char-admin-session-signing-key',
  'replace-with-32-plus-char-guest-order-token-secret',
  'replace-with-cron-secret',
  'replace-with-supabase-jwt-secret-from-dashboard',
  'replace-with-supabase-anon-key',
  'replace-with-supabase-service-role-key',
  'replace-with-your-key',
  'replace-with-your-secret',
  'default-secret-do-not-use-in-production',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  JWT_ACCESS_SECRET: z.string().default(''),
  JWT_ADMIN_ACCESS_SECRET: z.string().default(''),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_ADMIN_ACCESS_TTL: z.string().default('10m'),
  SESSION_SECRET: z.string().default(''),
  GUEST_ORDER_TOKEN_SECRET: z.string().default(''),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Monetary-Unit Safety Gate:
  // Canonical financial units across CircleUp are non-negative integer paise (1 INR = 100 paise).
  // In production, Supabase checkout cannot be activated until the production database
  // products table has been audited and verified to use paise (e.g. 400000 for ₹4,000).
  // Strictly parsed boolean: "true" -> true, "false" -> false, missing/empty -> false.
  MONETARY_RECONCILIATION_VERIFIED: strictBooleanEnvSchema,
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('https://circleuponline.com,https://www.circleuponline.com,http://localhost:5173,http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  FRONTEND_URL: z.string().url().default('https://circleuponline.com'),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@circleup.in'),
  RAZORPAY_ENABLED: strictBooleanEnvSchema,
  RAZORPAY_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  RESERVATION_EXPIRY_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SENTRY_DSN: z.string().optional(),
}).superRefine((data, ctx) => {
  // In automated test environments only, supply safe fixtures if secrets were omitted
  if (data.NODE_ENV === 'test') {
    if (!data.SESSION_SECRET) data.SESSION_SECRET = 'circleup-test-session-secret-at-least-32-characters';
    if (!data.JWT_ACCESS_SECRET) data.JWT_ACCESS_SECRET = 'circleup-test-jwt-access-secret-at-least-32-chars';
    if (!data.JWT_ADMIN_ACCESS_SECRET) data.JWT_ADMIN_ACCESS_SECRET = 'circleup-test-jwt-admin-access-secret-32-chars';
    if (!data.GUEST_ORDER_TOKEN_SECRET) data.GUEST_ORDER_TOKEN_SECRET = 'circleup-test-guest-token-secret-at-least-32';
    if (!data.CRON_SECRET) data.CRON_SECRET = 'circleup-test-cron-secret-at-least-16';
    return;
  }

  // Strict enforcement for all non-test environments (development, staging, production):
  // 1. SESSION_SECRET
  if (!data.SESSION_SECRET || INSECURE_SECRET_PLACEHOLDERS.has(data.SESSION_SECRET.trim().toLowerCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SESSION_SECRET'],
      message: 'SESSION_SECRET is required and must not be an insecure placeholder outside test environments.',
    });
  } else if (data.SESSION_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SESSION_SECRET'],
      message: 'SESSION_SECRET must be at least 32 characters outside test environments.',
    });
  }

  // 2. JWT_ACCESS_SECRET
  if (!data.JWT_ACCESS_SECRET || INSECURE_SECRET_PLACEHOLDERS.has(data.JWT_ACCESS_SECRET.trim().toLowerCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ACCESS_SECRET'],
      message: 'JWT_ACCESS_SECRET is required and must not be an insecure placeholder outside test environments.',
    });
  } else if (data.JWT_ACCESS_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ACCESS_SECRET'],
      message: 'JWT_ACCESS_SECRET must be at least 32 characters outside test environments.',
    });
  }

  // 3. JWT_ADMIN_ACCESS_SECRET
  if (!data.JWT_ADMIN_ACCESS_SECRET || INSECURE_SECRET_PLACEHOLDERS.has(data.JWT_ADMIN_ACCESS_SECRET.trim().toLowerCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ADMIN_ACCESS_SECRET'],
      message: 'JWT_ADMIN_ACCESS_SECRET is required and must not be an insecure placeholder outside test environments.',
    });
  } else if (data.JWT_ADMIN_ACCESS_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ADMIN_ACCESS_SECRET'],
      message: 'JWT_ADMIN_ACCESS_SECRET must be at least 32 characters outside test environments.',
    });
  }

  // 4. GUEST_ORDER_TOKEN_SECRET
  if (!data.GUEST_ORDER_TOKEN_SECRET || INSECURE_SECRET_PLACEHOLDERS.has(data.GUEST_ORDER_TOKEN_SECRET.trim().toLowerCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GUEST_ORDER_TOKEN_SECRET'],
      message: 'GUEST_ORDER_TOKEN_SECRET is required and must not be an insecure placeholder outside test environments.',
    });
  } else if (data.GUEST_ORDER_TOKEN_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GUEST_ORDER_TOKEN_SECRET'],
      message: 'GUEST_ORDER_TOKEN_SECRET must be at least 32 characters outside test environments.',
    });
  } else if (data.GUEST_ORDER_TOKEN_SECRET === data.SESSION_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GUEST_ORDER_TOKEN_SECRET'],
      message: 'GUEST_ORDER_TOKEN_SECRET must be distinct from SESSION_SECRET.',
    });
  }
});

export { envSchema };

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
