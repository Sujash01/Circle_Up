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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  MONGODB_URI: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().default(''),
  JWT_ADMIN_ACCESS_SECRET: z.string().default(''),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_ADMIN_ACCESS_TTL: z.string().default('10m'),
  SESSION_SECRET: z.string().default('circleup-super-secret-admin-session-signing-key-32chars'),
  GUEST_ORDER_TOKEN_SECRET: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Explicit Checkout Provider Selection:
  // Supabase is the canonical target architecture and default provider.
  // The legacy MongoDB checkout provider is only available in dev/test for migration compatibility.
  CHECKOUT_PROVIDER: z.enum(['supabase', 'mongodb']).default('supabase'),
  // Monetary-Unit Safety Gate:
  // Canonical financial units across CircleUp are non-negative integer paise (1 INR = 100 paise).
  // In production, Supabase checkout cannot be activated until the production database
  // products table has been audited and verified to use paise (e.g. 400000 for ₹4,000).
  // Strictly parsed boolean: "true" -> true, "false" -> false, missing/empty -> false.
  MONETARY_RECONCILIATION_VERIFIED: strictBooleanEnvSchema,
  STORAGE_CDN_URL: z.string().optional(),
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
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@circleup.in'),
  RAZORPAY_MODE: z.literal('test').default('test'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SENTRY_DSN: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    const defaultInsecure = 'circleup-super-secret-admin-session-signing-key-32chars';
    if (!data.SESSION_SECRET || data.SESSION_SECRET === defaultInsecure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET must be explicitly set to a unique, non-default secret in production.',
      });
    } else if (data.SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET must be at least 32 characters in production.',
      });
    }

    if (data.GUEST_ORDER_TOKEN_SECRET) {
      const defaultGuestSecret = 'circleup-guest-order-token-secret-at-least-32-chars';
      if (data.GUEST_ORDER_TOKEN_SECRET === defaultGuestSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GUEST_ORDER_TOKEN_SECRET'],
          message: 'GUEST_ORDER_TOKEN_SECRET must be explicitly set to a unique, non-default secret in production.',
        });
      } else if (data.GUEST_ORDER_TOKEN_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GUEST_ORDER_TOKEN_SECRET'],
          message: 'GUEST_ORDER_TOKEN_SECRET must be at least 32 characters in production.',
        });
      }
    }

    if (data.CHECKOUT_PROVIDER === 'mongodb') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CHECKOUT_PROVIDER'],
        message: 'Legacy MongoDB checkout provider cannot be enabled in production. Production must use Supabase.',
      });
    }
  }
});

export { envSchema };

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
