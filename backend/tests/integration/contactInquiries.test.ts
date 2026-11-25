import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateClient, mockSubmit } = vi.hoisted(() => {
  const mockSubmit = vi.fn();
  const mockCreateClient = vi.fn(() => ({
    rpc: (name: string, input: unknown) => name === 'submit_contact_inquiry'
      ? mockSubmit(input) : Promise.resolve({ data: null, error: null }),
  }));
  return { mockCreateClient, mockSubmit };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { resetSupabaseClientForTesting } from '../../src/services/supabase.service.js';

const app = createApp();
const originalUrl = env.SUPABASE_URL;
const originalServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
let nextIp = 1;

function contactRequest(ip = `198.51.100.${nextIp++}`) {
  return request(app).post('/api/v1/contact').set('X-Forwarded-For', ip);
}

const validPayload = {
  name: 'Rohan Sen',
  email: 'Rohan.Sen@example.com',
  subject: 'Inquiry about Vintage Denim Sizing',
  message: 'Hello, what are the shoulder measurements on CU-002?',
};

describe('POST /api/v1/contact', () => {
  beforeEach(() => {
    resetSupabaseClientForTesting();
    Reflect.set(env, 'SUPABASE_URL', 'https://circleup-test.supabase.co');
    Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-with-more-than-20-characters');
    nextIp++;
    mockCreateClient.mockClear();
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({
      data: {
        id: 'a62b737e-264b-4ad1-ad89-ae64f21f5b54',
        name: 'Rohan Sen',
        email: 'rohan.sen@example.com',
        subject: validPayload.subject,
        message: validPayload.message,
        status: 'NEW',
        created_at: '2026-11-22T10:00:00.000Z',
        updated_at: '2026-11-22T10:00:00.000Z',
      },
      error: null,
    });
  });

  afterEach(() => {
    resetSupabaseClientForTesting();
    Reflect.set(env, 'SUPABASE_URL', originalUrl);
    Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', originalServiceKey);
  });

  it('persists through the validated server client and preserves the 201 response envelope', async () => {
    const response = await contactRequest().send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Thank you! Your message has been received.',
      data: {
        id: 'a62b737e-264b-4ad1-ad89-ae64f21f5b54',
        name: 'Rohan Sen',
        email: 'rohan.sen@example.com',
        subject: validPayload.subject,
        message: validPayload.message,
        status: 'NEW',
        createdAt: '2026-11-22T10:00:00.000Z',
      },
    });
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://circleup-test.supabase.co',
      'test-service-role-key-with-more-than-20-characters',
      expect.any(Object),
    );
    expect(mockSubmit).toHaveBeenCalledWith({
      p_name: 'Rohan Sen',
      p_email: 'rohan.sen@example.com',
      p_subject: validPayload.subject,
      p_message: validPayload.message,
    });
  });

  it('rejects invalid email addresses without attempting persistence', async () => {
    const response = await contactRequest().send({ ...validPayload, email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['empty name', { ...validPayload, name: '   ' }],
    ['empty subject', { ...validPayload, subject: '   ' }],
    ['empty message', { ...validPayload, message: '   ' }],
    ['oversized name', { ...validPayload, name: 'x'.repeat(101) }],
    ['oversized email', { ...validPayload, email: `${'x'.repeat(251)}@e.co` }],
    ['oversized subject', { ...validPayload, subject: 'x'.repeat(201) }],
    ['oversized message', { ...validPayload, message: 'x'.repeat(5001) }],
  ])('rejects %s', async (_description, payload) => {
    const response = await contactRequest().send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('returns a storage error instead of success when Supabase insert fails', async () => {
    mockSubmit.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });

    const response = await contactRequest().send(validPayload);

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INQUIRY_STORAGE_UNAVAILABLE');
    expect(response.body.data).toBeUndefined();
  });

  it('returns a storage error when Supabase has no configured privileged credentials', async () => {
    resetSupabaseClientForTesting();
    Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await contactRequest().send(validPayload);

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.data).toBeUndefined();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('allows five submissions per IP per 15 minutes and rejects the sixth', async () => {
    const ip = '203.0.113.44';
    const responses = [];
    for (let i = 0; i < 6; i++) {
      responses.push(await contactRequest(ip).send(validPayload));
    }

    expect(responses.slice(0, 5).every((response) => response.status === 201)).toBe(true);
    expect(responses[5]?.status).toBe(429);
    expect(responses[5]?.body.error.code).toBe('RATE_LIMITED');
    expect(mockSubmit).toHaveBeenCalledTimes(5);
  });
});
