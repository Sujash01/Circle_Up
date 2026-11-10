import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('GET /api/v1/health & Express Middleware Pipeline', () => {
  it('returns 503 degraded envelope when database is disconnected and attaches X-Request-Id', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.headers['x-request-id']).toMatch(/^req-/);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'degraded',
      db: 'disconnected',
      environment: 'test',
    });
  });

  it('preserves valid caller X-Request-Id header', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-12345678');

    expect(res.headers['x-request-id']).toBe('trace-12345678');
  });

  it('returns standardized ApiErrorResponse for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'API endpoint not found',
      },
    });
    expect(typeof res.body.error.requestId).toBe('string');
  });
});

