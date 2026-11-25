import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const row: Record<string, unknown> = {
    id: 'default',
    announcement_text: 'Existing announcement',
    announcement_link: '/new-arrivals',
    is_announcement_active: true,
    marquee_phrases: ['First', 'Second'],
    category_tiles: [
      { to: '/rentals', title: 'Rentals', note: 'Borrow well', img: '/r.jpg', alt: 'Garment on hanger' },
      { to: '/finds', title: 'Finds', note: 'Rare pieces', img: '/f.jpg', alt: 'Bag close-up' },
      { to: '/accessories', title: 'Accessories', note: 'Finishing touches', img: '/a.jpg', alt: 'Scarf close-up' },
      { to: '/events', title: 'Events', note: 'Gather together', img: '/e.jpg', alt: 'Store interior' },
    ],
    curated_drop: { label: 'Archive', to: '/thrifted-treasure', badge: 'Featured', description: 'Curated pieces', enabled: true },
    store_address: 'CircleUp Studio, Chandigarh',
    contact_email: 'care@circleuponline.com',
    contact_phone: '+91 98765 43210',
    whatsapp_number: '919111222333',
    is_whatsapp_verified: true,
    content_version: 4,
    updated_at: '2026-11-22T10:00:00.000Z',
  };
  const initialRow = { ...row };
  let queryError: { message: string } | null = null;
  let selected = '*';
  let selectedTable = '';
  let pendingUpdate: Record<string, unknown> | undefined;
  let expectedVersion: unknown;
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  const from = vi.fn((table: string) => {
    selectedTable = table;
    pendingUpdate = undefined;
    expectedVersion = undefined;
    return builder;
  });
  const select = vi.fn((columns = '*') => { selected = String(columns); return builder; });
  const eq = vi.fn((column: string, value: unknown) => {
    if (column === 'content_version') expectedVersion = value;
    return builder;
  });
  const result = () => {
    if (pendingUpdate && !queryError) {
      if (expectedVersion !== undefined && row.content_version !== expectedVersion) return { data: null, error: null };
      Object.assign(row, pendingUpdate, { content_version: Number(row.content_version) + 1, updated_at: new Date().toISOString() });
    }
    return {
    data: queryError ? null : selectedTable === 'products' ? [] : selected === 'content_version'
      ? { content_version: row.content_version }
      : { ...row },
    error: queryError,
    };
  };
  const single = vi.fn(async () => result());
  const maybeSingle = vi.fn(async () => result());
  const insert = vi.fn((values: Record<string, unknown>) => { Object.assign(row, values); return builder; });
  const update = vi.fn((values: Record<string, unknown>) => {
    pendingUpdate = values;
    return builder;
  });
  const chain = vi.fn(() => builder);
  const then = (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: queryError ? null : [], error: queryError }).then(resolve, reject);
  Object.assign(builder, {
    select, eq, single, maybeSingle, insert, update, then,
    in: chain, order: chain, limit: chain, range: chain, gt: chain, gte: chain, lte: chain,
    neq: chain, not: chain, or: chain, ilike: chain, contains: chain,
  });
  return {
    row, from, select, eq, single, maybeSingle, insert, update,
    reset: () => { Object.assign(row, initialRow); queryError = null; selected = '*'; selectedTable = ''; },
    setError: (error: { message: string } | null) => { queryError = error; },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockState.from }),
}));

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { adminAuthService, signSessionToken, verifySessionToken } from '../../src/services/adminAuth.service.js';
import { resetSupabaseClientForTesting } from '../../src/services/supabase.service.js';
import { homepageService } from '../../src/services/homepage.service.js';

const app = createApp();
const originalUrl = env.SUPABASE_URL;
const originalServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const ownerToken = signSessionToken({
  userId: 'settings-owner', email: 'owner@example.com', name: 'Owner', role: 'owner',
  csrfToken: 'settings-owner-csrf', expiresAt: Date.now() + 60_000, sessionId: 'fixture-settings-owner',
});
const staffToken = signSessionToken({
  userId: 'settings-staff', email: 'staff@example.com', name: 'Staff', role: 'staff',
  csrfToken: 'settings-staff-csrf', expiresAt: Date.now() + 60_000, sessionId: 'fixture-settings-staff',
});

beforeEach(() => {
  vi.spyOn(adminAuthService, 'validateSession').mockImplementation(async (token) => verifySessionToken(token));
  Reflect.set(env, 'SUPABASE_URL', 'https://circleup-settings-test.supabase.co');
  Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', 'test-settings-service-role-key-long-enough');
  resetSupabaseClientForTesting();
  mockState.reset();
  mockState.from.mockClear();
  mockState.select.mockClear();
  mockState.eq.mockClear();
  mockState.single.mockClear();
  mockState.maybeSingle.mockClear();
  mockState.insert.mockClear();
  mockState.update.mockClear();
});

afterEach(() => {
  resetSupabaseClientForTesting();
  Reflect.set(env, 'SUPABASE_URL', originalUrl);
  Reflect.set(env, 'SUPABASE_SERVICE_ROLE_KEY', originalServiceKey);
});

describe('Site settings persistence and API contract', () => {
  it('reads all settings through Supabase and maps them to the existing API shape', async () => {
    const response = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      announcementText: 'Existing announcement',
      announcementLink: '/new-arrivals',
      isAnnouncementActive: true,
      marqueePhrases: ['First', 'Second'],
      categoryTiles: mockState.row.category_tiles,
      customDrop: mockState.row.curated_drop,
      storeAddress: 'CircleUp Studio, Chandigarh',
      contactEmail: 'care@circleuponline.com',
      contactPhone: '+91 98765 43210',
      whatsappNumber: '919111222333',
      isWhatsappVerified: true,
      contentVersion: 4,
    });
    expect(mockState.from).toHaveBeenCalledWith('site_settings');
  });

  it('allows owner updates and round-trips all editable fields', async () => {
    const update = {
      announcementText: 'Autumn archive',
      announcementLink: '/thrifted-treasure',
      isAnnouncementActive: false,
      marqueePhrases: ['Made to last'],
      categoryTiles: mockState.row.category_tiles,
      customDrop: { label: 'New Drop', to: '/new', badge: 'Fresh', description: 'New curation', enabled: true },
      storeAddress: 'CircleUp Studio, Chandigarh',
      contactEmail: 'help@example.com',
      contactPhone: '+91 90000 11111',
      whatsappNumber: '919000011111',
      isWhatsappVerified: false,
      contentVersion: 4,
      updatedAt: '2026-11-22T10:00:00.000Z',
    };
    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-CSRF-Token', 'settings-owner-csrf')
      .send(update);

    expect(response.status).toBe(200);
    const { updatedAt: _clientUpdatedAt, ...expectedSettings } = update;
    expect(response.body.data).toMatchObject({ ...expectedSettings, contentVersion: 5 });
    expect(response.body.data.updatedAt).not.toBe(update.updatedAt);
    expect(mockState.update).toHaveBeenCalled();
    expect(mockState.row).toMatchObject({
      announcement_text: 'Autumn archive',
      announcement_link: '/thrifted-treasure',
      is_announcement_active: false,
      curated_drop: update.customDrop,
      is_whatsapp_verified: false,
    });
  });

  it('rejects unauthenticated and non-owner updates', async () => {
    const anonymous = await request(app).put('/api/admin/settings').send({ storeAddress: 'No access' });
    const staff = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-CSRF-Token', 'settings-staff-csrf')
      .send({ storeAddress: 'No access' });

    expect(anonymous.status).toBe(401);
    expect(staff.status).toBe(403);
    expect(mockState.update).not.toHaveBeenCalled();
  });

  it('publishes the official number only after an owner explicitly verifies it', async () => {
    const official = '+916280746336';
    const update = (data: Record<string, unknown>) => request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-CSRF-Token', 'settings-owner-csrf')
      .send(data);

    await update({ whatsappNumber: official }).expect(200);
    expect(mockState.row).toMatchObject({ id: 'default', whatsapp_number: official, is_whatsapp_verified: false });
    const unverified = await request(app).get('/api/coupons/promotions').expect(200);
    expect(unverified.body.data.whatsappNumber).toBe('');

    const invalid = await update({ whatsappNumber: '910000000000', isWhatsappVerified: true }).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockState.row.whatsapp_number).toBe(official);

    await update({ whatsappNumber: official, isWhatsappVerified: true }).expect(200);
    expect(mockState.update).toHaveBeenLastCalledWith({
      whatsapp_number: official, is_whatsapp_verified: true,
    });
    const verified = await request(app).get('/api/coupons/promotions').expect(200);
    expect(verified.body.data.whatsappNumber).toBe('916280746336');
    expect((await homepageService.getHomepagePayload()).siteSettings.whatsappNumber).toBe('916280746336');
  });

  it('persists partial changes and rejects stale settings revisions', async () => {
    const save = (body: Record<string, unknown>) => request(app).put('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`).set('X-CSRF-Token', 'settings-owner-csrf').send(body);
    await save({ contactPhone: '+91 11111 11111', contentVersion: 4 }).expect(200);
    const stale = await save({ contactPhone: '+91 99999 99999', contentVersion: 4 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SETTINGS_VERSION_CONFLICT');
    expect(mockState.row).toMatchObject({
      contact_phone: '+91 11111 11111', contact_email: 'care@circleuponline.com',
      announcement_text: 'Existing announcement', content_version: 5,
    });
    await save({ customDrop: { enabled: false }, contentVersion: 5 }).expect(200);
    expect(mockState.row.curated_drop).toMatchObject({
      label: 'Archive', description: 'Curated pieces', to: '/thrifted-treasure', enabled: false,
    });
  });

  it('returns a storage error without synthetic fallback when Supabase fails', async () => {
    mockState.setError({ message: 'database unavailable' });
    const response = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SETTINGS_STORAGE_UNAVAILABLE');
    expect(response.body.data).toBeUndefined();
  });

  it('feeds the homepage announcement, category tiles, curated drop, and verified WhatsApp number', async () => {
    const payload = await homepageService.getHomepagePayload();

    expect(payload.announcementText).toBe(mockState.row.announcement_text);
    expect(payload.categoryTiles).toEqual(mockState.row.category_tiles);
    expect(payload.customDrop).toMatchObject(mockState.row.curated_drop as object);
    expect(payload.siteSettings).toMatchObject({
      storeAddress: mockState.row.store_address,
      contactEmail: mockState.row.contact_email,
      contactPhone: mockState.row.contact_phone,
      whatsappNumber: '919111222333',
      contentVersion: 4,
    });
  });
});
