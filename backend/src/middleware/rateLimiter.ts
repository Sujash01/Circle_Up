import rateLimit, { type Store, type Options, type ClientRateLimitInfo } from 'express-rate-limit';
import type { Request } from 'express';
import { TooManyRequestsError } from '../errors/AppError.js';
import { getSupabaseAdminClient, isSupabaseConfigured } from '../services/supabase.service.js';
import { env } from '../config/env.js';

type MemoryRecord = {
  totalHits: number;
  resetTime: Date;
};

/**
 * Distributed rate limit store supporting:
 * 1. Supabase Postgres backend (via increment_rate_limit RPC)
 * 2. Upstash Redis REST backend (if configured)
 * 3. In-memory graceful fallback (for offline tests and resilient degradation)
 */
export class DistributedRateLimitStore implements Store {
  private windowMs = 60000;
  private memory = new Map<string, MemoryRecord>();

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    // 1. Try Supabase Postgres distributed storage if configured
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        const { data, error } = await client.rpc('increment_rate_limit', {
          p_key: key,
          p_window_ms: this.windowMs,
        });

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0] as { total_hits: number; reset_at: string };
          return {
            totalHits: Number(row.total_hits),
            resetTime: new Date(row.reset_at),
          };
        }
      } catch {
        // Fall through to memory store gracefully on network/transient failure
      }
    }

    // 2. Try Upstash Redis REST if configured
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const url = `${env.UPSTASH_REDIS_REST_URL}/pipeline`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            ['INCR', `rl:${key}`],
            ['PTTL', `rl:${key}`],
          ]),
        });
        if (res.ok) {
          const json = await res.json() as Array<{ result: unknown }>;
          const hits = Number(json[0]?.result || 1);
          let pttl = Number(json[1]?.result || -1);
          if (pttl <= 0) {
            // Set expiration
            await fetch(`${env.UPSTASH_REDIS_REST_URL}/pexpire/rl:${encodeURIComponent(key)}/${this.windowMs}`, {
              headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
            });
            pttl = this.windowMs;
          }
          return {
            totalHits: hits,
            resetTime: new Date(Date.now() + Math.max(pttl, 0)),
          };
        }
      } catch {
        // Fall through
      }
    }

    // 3. Resilient In-Memory fallback
    const now = Date.now();
    const existing = this.memory.get(key);

    if (!existing || existing.resetTime.getTime() <= now) {
      const resetTime = new Date(now + this.windowMs);
      const record: MemoryRecord = { totalHits: 1, resetTime };
      this.memory.set(key, record);
      return record;
    }

    existing.totalHits += 1;
    return existing;
  }

  async decrement(key: string): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        await client
          .from('rate_limit_entries')
          .update({ hits: 0 })
          .eq('key', key);
      } catch {
        // Ignore
      }
    }
    const existing = this.memory.get(key);
    if (existing && existing.totalHits > 1) {
      existing.totalHits -= 1;
    } else {
      this.memory.delete(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        await client.rpc('reset_rate_limit', { p_key: key });
      } catch {
        // Ignore
      }
    }
    this.memory.delete(key);
  }

  async resetAll(): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        await client.from('rate_limit_entries').delete().neq('key', '');
      } catch {
        // Ignore
      }
    }
    this.memory.clear();
  }
}

// Shared singleton store across rate limiters
export const sharedRateLimitStore = new DistributedRateLimitStore();

export function createRateLimiter(
  windowMs: number,
  max: number,
  message: string,
  keyGenerator?: (req: Request) => string,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new DistributedRateLimitStore(),
    keyGenerator: keyGenerator || ((req: Request) => req.ip || req.socket.remoteAddress || 'unknown'),
    handler(_req, _res, next) {
      next(new TooManyRequestsError(message));
    },
  });
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export const customerAuthKeyGenerator = (req: Request) => {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : 'anon';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `auth:${email}:${ip}`;
};

export const adminAuthKeyGenerator = (req: Request) => {
  const rawEmail = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return rawEmail ? `admin_auth:${rawEmail}:${ip}` : `admin_auth:anon:${ip}`;
};

export const checkoutKeyGenerator = (req: Request) => {
  const email = req.body?.customer?.email ? String(req.body.customer.email).trim().toLowerCase() : 'guest';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `checkout:${email}:${ip}`;
};

export const couponKeyGenerator = (req: Request) =>
  `coupon_validate:${req.ip || req.socket.remoteAddress || 'unknown'}`;

export const globalRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  300,
  'Too many API requests, please try again shortly',
);

export const customerAuthRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  10,
  'Too many authentication attempts, please wait 15 minutes',
  customerAuthKeyGenerator,
);

/**
 * Admin Login Rate Limiting (P0-6):
 * Keyed strictly by email + IP, falling back to IP if email is absent
 */
export const adminAuthRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  process.env.NODE_ENV === 'production' ? 5 : 100,
  'Too many admin login attempts, please wait 15 minutes',
  adminAuthKeyGenerator,
);

/**
 * Checkout Rate Limiting (P0-6):
 * Keyed by customer email + IP to prevent denial-of-service and bot checkout floods
 */
export const checkoutRateLimiter = createRateLimiter(
  TEN_MINUTES_MS,
  15,
  'Too many checkout attempts, please wait before trying again',
  checkoutKeyGenerator,
);

export const orderLookupRateLimiter = createRateLimiter(
  TEN_MINUTES_MS,
  30,
  'Too many order lookup attempts, please wait 10 minutes',
  (req) => `order_lookup:${req.ip || req.socket.remoteAddress || 'unknown'}`,
);

/**
 * Coupon Validation Rate Limiter (P1-3 & P0-6):
 * Strictly blocks promo code enumeration and brute force attacks (10 attempts per 10 mins)
 */
export const couponRateLimiter = createRateLimiter(
  TEN_MINUTES_MS,
  10,
  'Too many coupon validation attempts, please wait 10 minutes',
  couponKeyGenerator,
);

export const contactRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  5,
  'Too many contact submissions, please try again later',
  (req) => `contact:${req.ip || req.socket.remoteAddress || 'unknown'}`,
);

export const eventRegistrationRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  5,
  'Too many event registration attempts, please try again later',
  (req) => `event_reg:${req.ip || req.socket.remoteAddress || 'unknown'}`,
);

export const customerOrdersRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  60,
  'Too many order list requests, please try again shortly',
  (req) => `cust_orders:${req.ip || req.socket.remoteAddress || 'unknown'}`,
);

export const searchRateLimiter = createRateLimiter(
  60 * 1000,
  60,
  'Too many search queries, please slow down',
  (req) => `search:${req.ip || req.socket.remoteAddress || 'unknown'}`,
);

export const userSubmissionRateLimiter = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  10,
  'Too many submissions, please wait a few minutes before submitting again',
  (req) => `submission:${req.ip || req.socket.remoteAddress || 'unknown'}`,
);
