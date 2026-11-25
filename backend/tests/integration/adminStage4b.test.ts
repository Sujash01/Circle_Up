import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { adminAuthService, signSessionToken, verifySessionToken } from '../../src/services/adminAuth.service.js';
import { adminOrderService } from '../../src/services/adminOrder.service.js';
import { adminInquiryService } from '../../src/services/adminInquiry.service.js';
import { rentalRepository } from '../../src/repositories/rental.repository.js';
import { UnauthorizedError } from '../../src/errors/AppError.js';
import { DistributedRateLimitStore } from '../../src/middleware/rateLimiter.js';
import * as supabase from '../../src/services/supabase.service.js';
import { env } from '../../src/config/env.js';

const app = createApp();
const order = 'ORD-TEST-12345678';
const id = '3534b775-cfa9-41f8-9e58-74d87a2e1d2b';
const cancellation = `/api/admin/orders/${order}/cancel`;
const input = { reason: 'Customer asked to cancel.', password: 'local-test-password' };
let userNumber = 0;

function session(role: 'owner' | 'staff' = 'owner', expiresAt = Date.now() + 60_000) {
  const userId = `stage4b-test-${++userNumber}`;
  return signSessionToken({
    userId, email: 'admin@example.test', name: 'Test Admin', role, expiresAt,
    csrfToken: 'test-csrf', sessionId: userId,
  });
}

function authorize(req: request.Test, token = session()) {
  return req.set('Cookie', `admin_session=${token}`).set('X-CSRF-Token', 'test-csrf');
}

beforeEach(() => {
  vi.spyOn(adminAuthService, 'validateSession').mockImplementation(async (token) => verifySessionToken(token));
});
afterEach(() => vi.restoreAllMocks());

describe('Stage 4B admin routes', () => {
  it('rejects missing, invalid, expired, staff, and non-CSRF cancellation requests', async () => {
    const reauthenticate = vi.spyOn(adminAuthService, 'reauthenticateOwner');
    const cancel = vi.spyOn(adminOrderService, 'cancelOrder');
    expect((await request(app).post(cancellation).send(input)).status).toBe(401);
    expect((await authorize(request(app).post(cancellation), 'invalid').send(input)).status).toBe(401);
    expect((await authorize(request(app).post(cancellation), session('owner', Date.now() - 1000)).send(input)).status).toBe(401);
    expect((await authorize(request(app).post(cancellation), session('staff')).send(input)).status).toBe(403);
    expect((await request(app).post(cancellation).set('Cookie', `admin_session=${session()}`).send(input)).status).toBe(403);
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('validates the reason and password before invoking the order RPC', async () => {
    const reauthenticate = vi.spyOn(adminAuthService, 'reauthenticateOwner')
      .mockRejectedValue(new UnauthorizedError('Administrator password is incorrect.', 'INVALID_PASSWORD'));
    const cancel = vi.spyOn(adminOrderService, 'cancelOrder');
    expect((await authorize(request(app).post(cancellation)).send({ ...input, reason: '  ' })).status).toBe(400);
    expect(reauthenticate).not.toHaveBeenCalled();
    const incorrect = await authorize(request(app).post(cancellation)).send(input);
    expect(incorrect.status).toBe(401);
    expect(incorrect.body.error.code).toBe('INVALID_PASSWORD');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('passes the actor and reason to the cancellation service after reauthentication', async () => {
    const reauthenticate = vi.spyOn(adminAuthService, 'reauthenticateOwner').mockResolvedValue();
    const cancel = vi.spyOn(adminOrderService, 'cancelOrder').mockResolvedValue({
      outcome: 'INVENTORY_REVIEW', refundRequired: true, order: { orderNumber: order } as never,
    });
    const response = await authorize(request(app).post(cancellation)).send(input);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(reauthenticate).toHaveBeenCalledWith(expect.objectContaining({ role: 'owner' }), input.password);
    expect(cancel).toHaveBeenCalledWith(order, input.reason, expect.objectContaining({ role: 'owner' }), expect.any(String));
    expect(response.body.data).toMatchObject({ outcome: 'INVENTORY_REVIEW', refundRequired: true });
    expect(JSON.stringify(response.body)).not.toContain(input.password);
  });

  it('rate-limits repeated password checks for the same owner', async () => {
    const token = session();
    const reauthenticate = vi.spyOn(adminAuthService, 'reauthenticateOwner')
      .mockRejectedValue(new UnauthorizedError('Administrator password is incorrect.', 'INVALID_PASSWORD'));
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await authorize(request(app).post(cancellation), token).send(input)).status).toBe(401);
    }
    expect((await authorize(request(app).post(cancellation), token).send(input)).status).toBe(429);
    expect(reauthenticate).toHaveBeenCalledTimes(5);
  });

  it('rejects generic order-status cancellation', async () => {
    const response = await authorize(request(app).put(`/api/admin/orders/${order}/status`)).send({ status: 'CANCELLED' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CANCELLATION_REAUTH_REQUIRED');
  });

  it('requires the dedicated database limiter in production and rejects invalid counters', async () => {
    const environment = env.NODE_ENV;
    Reflect.set(env, 'NODE_ENV', 'production');
    try {
      const rpc = vi.fn()
        .mockResolvedValueOnce({ data: [{ total_hits: 3, reset_at: '2030-01-01T00:00:00Z' }], error: null })
        .mockResolvedValueOnce({ data: [{ total_hits: null, reset_at: 'invalid' }], error: null })
        .mockRejectedValueOnce(new Error('Database unavailable'));
      vi.spyOn(supabase, 'getSupabaseAdminClient').mockReturnValue({ rpc } as never);
      vi.spyOn(supabase, 'isSupabaseConfigured').mockReturnValue(true);
      const key = `admin_order_reauth:${id}`;
      const store = new DistributedRateLimitStore(true);
      store.init({ windowMs: 900_000 } as never);
      await expect(store.increment(key)).resolves.toMatchObject({ totalHits: 3 });
      expect(rpc).toHaveBeenCalledWith('stage4b_increment_order_reauth_limit', { p_key: key, p_window_ms: 900_000 });
      await expect(store.increment(key)).rejects.toMatchObject({ code: 'RATE_LIMIT_STORAGE_UNAVAILABLE' });
      await expect(store.increment(key)).rejects.toMatchObject({ code: 'RATE_LIMIT_STORAGE_UNAVAILABLE' });
    } finally {
      Reflect.set(env, 'NODE_ENV', environment);
    }
  });

  it('lists inquiries and checks detail and status inputs', async () => {
    const list = vi.spyOn(adminInquiryService, 'listInquiries').mockResolvedValue({
      inquiries: [], meta: { page: 2, limit: 20, total: 0, totalPages: 1, hasNext: false },
    });
    expect((await request(app).get('/api/admin/inquiries')).status).toBe(401);
    expect((await authorize(request(app).get('/api/admin/inquiries?status=IN_REVIEW&page=2'))).status).toBe(200);
    expect(list).toHaveBeenCalledWith({ status: 'IN_REVIEW', page: 2 });
    expect((await authorize(request(app).get('/api/admin/inquiries/not-a-uuid'))).status).toBe(400);
    expect((await authorize(request(app).patch(`/api/admin/inquiries/${id}`)).send({ status: 'UNSUPPORTED' })).status).toBe(400);
  });

  it('lists booking pages and validates status updates', async () => {
    const list = vi.spyOn(rentalRepository, 'listBookings').mockResolvedValue({ bookings: [], total: 0 });
    const update = vi.spyOn(rentalRepository, 'updateBooking').mockResolvedValue({ id, status: 'CONFIRMED' } as never);
    expect((await request(app).get('/api/admin/rental-bookings')).status).toBe(401);
    expect((await authorize(request(app).get('/api/admin/rental-bookings?page=2&limit=5'))).status).toBe(200);
    expect(list).toHaveBeenCalledWith(2, 5);
    expect((await authorize(request(app).patch(`/api/admin/rental-bookings/${id}`)).send({ status: 'PAID' })).status).toBe(400);
    expect((await authorize(request(app).patch(`/api/admin/rental-bookings/${id}`)).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(id, 'CONFIRMED');
  });
});
