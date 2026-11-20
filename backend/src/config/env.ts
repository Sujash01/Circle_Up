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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  MONGODB_URI: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().default(''),
  JWT_ADMIN_ACCESS_SECRET: z.string().default(''),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_ADMIN_ACCESS_TTL: z.string().default('10m'),
  SESSION_SECRET: z.string().default('circleup-super-secret-admin-session-signing-key-32chars'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
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
  }
});

export { envSchema };

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
