import { describe, expect, it } from 'vitest';
import {
  DistributedRateLimitStore,
  sharedRateLimitStore,
  adminAuthKeyGenerator,
  checkoutKeyGenerator,
  couponKeyGenerator,
} from '../../src/middleware/rateLimiter.js';
import type { Request } from 'express';

describe('Distributed Rate Limiting (Resolves P0-6 & P1-3)', () => {
  it('Shared rate limit store singleton is instantiated', () => {
    expect(sharedRateLimitStore).toBeInstanceOf(DistributedRateLimitStore);
  });

  it('DistributedRateLimitStore increments hits and tracks reset time', async () => {
    const store = new DistributedRateLimitStore();
    store.init({ windowMs: 5000 } as any);

    const key = `test_key_${Date.now()}`;
    const first = await store.increment(key);
    expect(first.totalHits).toBe(1);
    expect(first.resetTime).toBeInstanceOf(Date);
    expect(first.resetTime.getTime()).toBeGreaterThan(Date.now());

    const second = await store.increment(key);
    expect(second.totalHits).toBe(2);

    await store.decrement(key);
    const third = await store.increment(key);
    // After decrementing 2 -> 1, incrementing should be 2
    expect(third.totalHits).toBe(2);

    await store.resetKey(key);
    const fourth = await store.increment(key);
    expect(fourth.totalHits).toBe(1);
  });

  it('adminAuthRateLimiter keys strictly by email + IP, with safe anon fallback', () => {
    // Case 1: Normal email and IP
    const reqWithEmail = {
      body: { email: 'Admin@CircleUpOnline.COM ' },
      ip: '203.0.113.195',
      socket: { remoteAddress: '203.0.113.195' },
    } as unknown as Request;
    expect(adminAuthKeyGenerator(reqWithEmail)).toBe('admin_auth:admin@circleuponline.com:203.0.113.195');

    // Case 2: Missing email
    const reqWithoutEmail = {
      body: {},
      ip: '198.51.100.42',
      socket: { remoteAddress: '198.51.100.42' },
    } as unknown as Request;
    expect(adminAuthKeyGenerator(reqWithoutEmail)).toBe('admin_auth:anon:198.51.100.42');

    // Case 3: Empty string email
    const reqEmptyEmail = {
      body: { email: '   ' },
      ip: '198.51.100.42',
      socket: { remoteAddress: '198.51.100.42' },
    } as unknown as Request;
    expect(adminAuthKeyGenerator(reqEmptyEmail)).toBe('admin_auth:anon:198.51.100.42');
  });

  it('checkoutRateLimiter keys by customer email + IP to prevent checkout floods', () => {
    const reqWithCust = {
      body: { customer: { email: 'buyer@example.com' } },
      ip: '192.0.2.1',
      socket: { remoteAddress: '192.0.2.1' },
    } as unknown as Request;
    expect(checkoutKeyGenerator(reqWithCust)).toBe('checkout:buyer@example.com:192.0.2.1');

    const reqGuest = {
      body: {},
      ip: '192.0.2.1',
      socket: { remoteAddress: '192.0.2.1' },
    } as unknown as Request;
    expect(checkoutKeyGenerator(reqGuest)).toBe('checkout:guest:192.0.2.1');
  });

  it('couponRateLimiter keys by IP to prevent promo code enumeration attacks', () => {
    const req = {
      ip: '192.0.2.55',
      socket: { remoteAddress: '192.0.2.55' },
    } as unknown as Request;
    expect(couponKeyGenerator(req)).toBe('coupon_validate:192.0.2.55');
  });
});
