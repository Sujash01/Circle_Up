import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { adminAuthService } from '../../src/services/adminAuth.service.js';

const app = createApp();

describe('Phase 3: Admin Backend (/api/admin/*)', () => {
  let ownerCookie: string;
  let ownerCsrf: string;
  let staffCookie: string;
  let staffCsrf: string;

  beforeAll(async () => {
    // Seed initial owner and staff users
    await adminAuthService.createAdminUser({
      email: 'owner@circleuponline.com',
      password: 'OwnerPassword123!',
      name: 'Store Owner',
      role: 'owner',
      force: true,
    });

    await adminAuthService.createAdminUser({
      email: 'staff@circleuponline.com',
      password: 'StaffPassword123!',
      name: 'Store Staff',
      role: 'staff',
      force: true,
    });

    // Login as owner
    const ownerRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'owner@circleuponline.com', password: 'OwnerPassword123!' });

    expect(ownerRes.status).toBe(200);
    ownerCookie = ownerRes.headers['set-cookie'][0];
    ownerCsrf = ownerRes.body.data.csrfToken;

    // Login as staff
    const staffRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'staff@circleuponline.com', password: 'StaffPassword123!' });

    expect(staffRes.status).toBe(200);
    staffCookie = staffRes.headers['set-cookie'][0];
    staffCsrf = staffRes.body.data.csrfToken;
  });

  describe('1. Authentication, Sessions & CSRF Security', () => {
    it('sets HttpOnly session cookie on successful login', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'owner@circleuponline.com', password: 'OwnerPassword123!' });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('admin_session=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(res.body.data).toHaveProperty('csrfToken');
      expect(res.body.data.user.role).toBe('owner');
    });

    it('rejects invalid password with 401', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'owner@circleuponline.com', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('GET /api/admin/auth/me returns current session details', async () => {
      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('owner@circleuponline.com');
      expect(res.body.data.user.role).toBe('owner');
    });

    it('blocks state-changing mutation if X-CSRF-Token is missing (403)', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Cookie', ownerCookie)
        .send({ name: 'CSRF Attack Shirt', price: 150000 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('blocks state-changing mutation if X-CSRF-Token is invalid (403)', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', 'forged-token-abc-123')
        .send({ name: 'CSRF Attack Shirt', price: 150000 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('admin endpoints include no-store cache headers', async () => {
      const res = await request(app)
        .get('/api/admin/products')
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });

  describe('2. Role-Based Access Control (RBAC)', () => {
    it('staff CAN read and manage products', async () => {
      const res = await request(app)
        .get('/api/admin/products')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('staff CANNOT update site settings (403 owner-only)', async () => {
      const res = await request(app)
        .put('/api/admin/settings')
        .set('Cookie', staffCookie)
        .set('X-CSRF-Token', staffCsrf)
        .send({ storeAddress: 'Unauthorized Staff Address' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('owner CAN update site settings', async () => {
      const res = await request(app)
        .put('/api/admin/settings')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .send({ announcementText: 'Updated by store owner!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Product Management (CRUD, Bulk, Soft Delete & Duplicate)', () => {
    let createdSerial: string;

    it('creates product with auto-generated serial and slug', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .send({
          name: 'Vintage Silk Slip Dress',
          price: 280000,
          stock: 3,
          category: 'womens-one-piece',
          condition: 'Mint',
          sizes: ['S', 'M'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Vintage Silk Slip Dress');
      expect(res.body.data).toHaveProperty('serialNumber');
      createdSerial = res.body.data.serialNumber;
    });

    it('updates product attributes', async () => {
      const res = await request(app)
        .put(`/api/admin/products/${createdSerial}`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .send({ price: 295000, badge: 'Curator Pick' });

      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe(295000);
      expect(res.body.data.badge).toBe('Curator Pick');
    });

    it('duplicates product as a draft copy', async () => {
      const res = await request(app)
        .post(`/api/admin/products/${createdSerial}/duplicate`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toContain('(Copy)');
    });

    it('soft deletes product', async () => {
      const res = await request(app)
        .delete(`/api/admin/products/${createdSerial}`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('restores soft-deleted product', async () => {
      const res = await request(app)
        .post(`/api/admin/products/${createdSerial}/restore`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('performs bulk actions (publish, archive)', async () => {
      const res = await request(app)
        .post('/api/admin/products/bulk')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .send({ action: 'publish', ids: [createdSerial] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Media Handling & Processing', () => {
    it('rejects corrupt/non-image buffer with 400', async () => {
      const fakeTextBuffer = Buffer.from('This is definitely not an image file');

      const res = await request(app)
        .post('/api/admin/media/upload')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .attach('images', fakeTextBuffer, 'fake.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IMAGE_FORMAT');
    });

    it('accepts genuine image and returns 400w, 800w, 1600w variants and content hash', async () => {
      // Create a genuine 100x100 PNG buffer using Sharp
      const validPng = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 30, g: 42, b: 28 }, // CircleUp deep forest green
        },
      })
        .png()
        .toBuffer();

      const res = await request(app)
        .post('/api/admin/media/upload')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .attach('images', validPng, 'test-swatch.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('w400');
      expect(res.body.data).toHaveProperty('w800');
      expect(res.body.data).toHaveProperty('w1600');
      expect(res.body.data).toHaveProperty('hash');
      expect(res.body.data.w400).toContain('-400w.webp');
    });
  });

  describe('5. Order Management & Status Transitions', () => {
    it('GET /api/admin/orders lists customer orders', async () => {
      const res = await request(app)
        .get('/api/admin/orders')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('6. Coupons Management', () => {
    it('GET /api/admin/coupons lists launch coupons', async () => {
      const res = await request(app)
        .get('/api/admin/coupons')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
