import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({
  data: {
    announcementText: '', announcementLink: '/new-arrivals', isAnnouncementActive: true,
    marqueePhrases: [], categoryTiles: [], customDrop: { enabled: false, title: '', imageUrl: '', linkUrl: '' },
    storeAddress: '', contactEmail: '', contactPhone: '', whatsappNumber: '', isWhatsappVerified: false,
    contentVersion: 1, updatedAt: new Date().toISOString(),
  } as Record<string, any>,
}));
const couponState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  create: vi.fn(async (input: Record<string, any>) => {
    const row = { id: 'coupon-uuid-001', usageCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...input };
    couponState.rows.unshift(row);
    return row;
  }),
  update: vi.fn(async (id: string, input: Record<string, any>) => {
    const row = couponState.rows.find((item) => item.id === id);
    if (!row) throw new Error('Coupon not found.');
    Object.assign(row, input);
    row.type = row.discountType;
    return row;
  }),
}));
const eventState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));
const rentalState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));
const productState = vi.hoisted(() => {
  const rows: Array<Record<string, any>> = [];
  let nextSerial = 1;
  const find = (id: string) => rows.find((row) => row.serialNumber === id || row.id === id || row.slug === id);
  return {
    rows,
    list: async () => ({ products: [...rows], total: rows.length, page: 1, limit: 20 }),
    create: async (input: Record<string, any>) => {
      const serialNumber = input.serialNumber || `CU-${String(nextSerial++).padStart(3, '0')}`;
      const row = { id: `product-${serialNumber}`, serialNumber, slug: input.slug || `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${serialNumber.toLowerCase()}`, status: 'PUBLISHED', stock: 1, images: [], sizes: [], ...input };
      rows.push(row);
      return row;
    },
    update: async (id: string, input: Record<string, any>) => {
      const row = find(id);
      if (!row) throw new Error('Product not found.');
      Object.assign(row, input);
      return { ...row };
    },
    duplicate: async (id: string) => {
      const source = find(id);
      if (!source) throw new Error('Product not found.');
      const serialNumber = `CU-${String(nextSerial++).padStart(3, '0')}`;
      const row = { ...source, id: `product-${serialNumber}`, serialNumber, slug: `${source.slug}-copy-${serialNumber.toLowerCase()}`, name: `${source.name} (Copy)`, status: 'DRAFT' };
      rows.push(row);
      return row;
    },
    bulkAction: async (_action: string, ids: string[]) => ({ modifiedCount: ids.filter((id) => Boolean(find(id))).length }),
    softDelete: async (id: string) => { const row = find(id); if (!row) throw new Error('Product not found.'); row.status = 'ARCHIVED'; return { message: 'Product archived.' }; },
    restore: async (id: string) => { const row = find(id); if (!row) throw new Error('Product not found.'); row.status = 'PUBLISHED'; return { message: 'Product restored.' }; },
    permanentDelete: async (id: string) => { const index = rows.findIndex((row) => row.serialNumber === id || row.id === id); if (index < 0) throw new Error('Product not found.'); rows.splice(index, 1); return { message: 'Product permanently deleted.' }; },
  };
});
vi.mock('../../src/services/supabaseCatalog.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabaseCatalog.service.js')>();
  return {
    ...actual,
    supabaseCatalogService: {
      ...actual.supabaseCatalogService,
      listAdminProducts: productState.list,
      createProduct: productState.create,
      updateProduct: productState.update,
      duplicateProduct: productState.duplicate,
      bulkAction: productState.bulkAction,
      softDeleteProduct: productState.softDelete,
      restoreProduct: productState.restore,
      permanentDeleteProduct: productState.permanentDelete,
    },
  };
});
vi.mock('../../src/repositories/settings.repository.js', () => ({
  settingsRepository: {
    getSettings: async () => ({ ...settingsState.data }),
    updateSettings: async (patch: Record<string, unknown>) => (settingsState.data = { ...settingsState.data, ...patch, contentVersion: settingsState.data.contentVersion + 1 }),
    bumpVersion: async () => ++settingsState.data.contentVersion,
  },
}));
vi.mock('../../src/repositories/coupon.repository.js', () => ({
  couponRepository: {
    list: async () => couponState.rows,
    create: couponState.create,
    update: couponState.update,
    delete: async (id: string) => { couponState.rows = couponState.rows.filter((row) => row.id !== id); },
  },
}));
vi.mock('../../src/repositories/event.repository.js', () => ({
  eventRepository: {
    list: async () => eventState.rows,
    create: async (input: Record<string, unknown>) => { const row = { id: 'event-uuid-001', ...input }; eventState.rows.push(row); return row; },
    update: async (id: string, input: Record<string, unknown>) => { const row = eventState.rows.find((item) => item.id === id); if (!row) throw new Error('Event not found.'); Object.assign(row, input); return row; },
    delete: async (id: string) => { eventState.rows = eventState.rows.filter((row) => row.id !== id); },
  },
}));
vi.mock('../../src/repositories/rental.repository.js', () => ({
  rentalRepository: {
    list: async () => rentalState.rows,
    create: async (input: Record<string, unknown>) => { const row = { id: 'rental-uuid-001', ...input }; rentalState.rows.push(row); return row; },
    update: async (id: string, input: Record<string, unknown>) => { const row = rentalState.rows.find((item) => item.id === id); if (!row) throw new Error('Rental item not found.'); Object.assign(row, input); return row; },
    delete: async (id: string) => { rentalState.rows = rentalState.rows.filter((row) => row.id !== id); },
  },
}));
vi.mock('../../src/services/audit.service.js', () => ({ auditService: { record: async () => undefined, list: async () => [] } }));
import { createApp } from '../../src/app.js';
import { adminAuthService, signSessionToken, verifySessionToken } from '../../src/services/adminAuth.service.js';
import { adminCustomerService } from '../../src/services/adminCustomer.service.js';
import { storageService } from '../../src/services/storage.service.js';
import { ServiceUnavailableError, UnauthorizedError } from '../../src/errors/AppError.js';

const app = createApp();

describe('Phase 3: Admin Backend (/api/admin/*)', () => {
  let ownerCookie: string;
  let ownerCsrf: string;
  let staffCookie: string;
  let staffCsrf: string;

  beforeAll(async () => {
    vi.spyOn(adminAuthService, 'validateSession').mockImplementation(async (token) => verifySessionToken(token));
    const users = new Map<string, { id: string; email: string; name: string; password: string; role: 'owner' | 'staff' }>();
    vi.spyOn(adminAuthService, 'createAdminUser').mockImplementation(async (input) => {
      const row = { id: `fixture-${input.role}`, email: input.email.toLowerCase(), name: input.name, password: input.password, role: input.role };
      users.set(row.email, row);
      return row;
    });
    vi.spyOn(adminAuthService, 'login').mockImplementation(async (email, password) => {
      const user = users.get(email.toLowerCase());
      if (!user || user.password !== password) throw new UnauthorizedError('Invalid admin email or password.', 'INVALID_CREDENTIALS');
      const csrfToken = `csrf-${user.id}`;
      const sessionToken = signSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role, csrfToken, expiresAt: Date.now() + 86400000, sessionId: `session-${user.id}` });
      return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrfToken, sessionToken, sessionId: `session-${user.id}` };
    });
    vi.spyOn(adminAuthService, 'listAdminUsers').mockResolvedValue([{ id: 'fixture-owner', email: 'owner@circleuponline.com', name: 'Store Owner', role: 'owner', isActive: true }]);
    vi.spyOn(adminAuthService, 'getAdminUserById').mockResolvedValue({ id: 'fixture-staff', email: 'staff@circleuponline.com', name: 'Store Staff', role: 'staff', isActive: true });
    vi.spyOn(adminAuthService, 'updateAdminUser').mockResolvedValue({ id: 'fixture-staff', email: 'staff@circleuponline.com', name: 'Updated Staff', role: 'staff', isActive: true });
    vi.spyOn(adminAuthService, 'revokeSession').mockResolvedValue(undefined);
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
    expect(ownerRes.body.data).not.toHaveProperty('sessionToken');
    expect(ownerRes.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(ownerRes.headers['set-cookie'][0]).toMatch(/SameSite=Lax/i);
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

    it('requires CSRF on logout and revokes the persisted session before reporting success', async () => {
      const denied = await request(app).post('/api/admin/auth/logout').set('Cookie', ownerCookie);
      expect(denied.status).toBe(403);
      const signedOut = await request(app).post('/api/admin/auth/logout').set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf);
      expect(signedOut.status).toBe(200);
      expect(signedOut.headers['set-cookie'][0]).toContain('admin_session=;');
      expect(adminAuthService.revokeSession).toHaveBeenCalled();
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

  describe('Administrator management authorization and contracts', () => {
    it('allows owners to list and view users while staff is denied', async () => {
      const list = await request(app).get('/api/admin/users').set('Cookie', ownerCookie);
      const detail = await request(app).get('/api/admin/users/43b92f3c-38ba-4aa2-b840-4965125fe876').set('Cookie', ownerCookie);
      const denied = await request(app).get('/api/admin/users').set('Cookie', staffCookie);
      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      expect(denied.status).toBe(403);
    });

    it('requires CSRF for create/update and preserves the user response shape', async () => {
      const noCsrf = await request(app).post('/api/admin/users').set('Cookie', ownerCookie).send({ email: 'new@example.com', name: 'New Staff', password: 'StrongPassword123!', role: 'staff' });
      expect(noCsrf.status).toBe(403);
      const created = await request(app).post('/api/admin/users').set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf).send({ email: 'new@example.com', name: 'New Staff', password: 'StrongPassword123!', role: 'staff' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ email: 'new@example.com', role: 'staff' });
      const updated = await request(app).patch('/api/admin/users/43b92f3c-38ba-4aa2-b840-4965125fe876').set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf).send({ name: 'Updated Staff' });
      expect(updated.status).toBe(200);
    });
  });

  describe('Customer CRM authorization', () => {
    it('requires admin authentication to read customers and owner plus CSRF to update profiles', async () => {
      const unauthenticated = await request(app).get('/api/admin/customers');
      expect(unauthenticated.status).toBe(401);

      const update = vi.spyOn(adminCustomerService, 'updateCustomer').mockResolvedValue({
        customer: { id: 'c46b909a-e751-4c00-967e-8cdf1b41e4e2', name: 'Updated Customer' } as never,
        orders: [], sustainabilityImpact: { garmentsSaved: 0, co2AvoidedKg: 0, waterSavedLitres: 0 },
        savedAddresses: [], marketingPreferences: { email: false, whatsapp: false },
      });
      const forbidden = await request(app).patch('/api/admin/customers/c46b909a-e751-4c00-967e-8cdf1b41e4e2')
        .set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf).send({ notes: 'Private note' });
      expect(forbidden.status).toBe(403);
      expect(update).not.toHaveBeenCalled();

      const missingCsrf = await request(app).patch('/api/admin/customers/c46b909a-e751-4c00-967e-8cdf1b41e4e2')
        .set('Cookie', ownerCookie).send({ notes: 'Private note' });
      expect(missingCsrf.status).toBe(403);

      const allowed = await request(app).patch('/api/admin/customers/c46b909a-e751-4c00-967e-8cdf1b41e4e2')
        .set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf).send({ notes: 'Private note' });
      expect(allowed.status).toBe(200);
      expect(update).toHaveBeenCalledWith('c46b909a-e751-4c00-967e-8cdf1b41e4e2', { notes: 'Private note' });
      update.mockRestore();
    });
  });

  describe('3. Product Management (CRUD, Bulk, Soft Delete & Duplicate)', () => {
    let createdSerial: string;
    const ensureProduct = async (status = 'PUBLISHED') => {
      if (createdSerial) return createdSerial;
      const row = await productState.create({ name: 'Independent catalogue fixture', price: 280000, stock: 3, status });
      createdSerial = row.serialNumber;
      return createdSerial;
    };

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
      const serial = await ensureProduct();
      const res = await request(app)
        .put(`/api/admin/products/${serial}`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .send({ price: 295000, badge: 'Curator Pick' });

      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe(295000);
      expect(res.body.data.badge).toBe('Curator Pick');
    });

    it('duplicates product as a draft copy', async () => {
      const serial = await ensureProduct();
      const res = await request(app)
        .post(`/api/admin/products/${serial}/duplicate`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toContain('(Copy)');
    });

    it('soft deletes product', async () => {
      const serial = await ensureProduct();
      const res = await request(app)
        .delete(`/api/admin/products/${serial}`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('restores soft-deleted product', async () => {
      const serial = await ensureProduct('ARCHIVED');
      const res = await request(app)
        .post(`/api/admin/products/${serial}/restore`)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('performs bulk actions (publish, archive)', async () => {
      const serial = await ensureProduct();
      const res = await request(app)
        .post('/api/admin/products/bulk')
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', ownerCsrf)
        .send({ action: 'publish', ids: [serial] });

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

      const upload = vi.spyOn(storageService, 'processAndStoreImage').mockResolvedValue({
        original: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/object/800w.webp',
        w400: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/object/400w.webp',
        w800: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/object/800w.webp',
        w1600: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/object/1600w.webp',
        hash: '0123456789abcdef',
      });

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
      expect(res.body.data.w400).toContain('/400w.webp');
      expect(upload).toHaveBeenCalledWith(validPng, 'test-swatch.png', 'products', 'image/png');
      upload.mockRestore();
    });

    it('fails visibly when Supabase Storage is unavailable and enforces auth and CSRF', async () => {
      const unauthorized = await request(app).post('/api/admin/media/upload');
      expect(unauthorized.status).toBe(401);
      const missingCsrf = await request(app).post('/api/admin/media/upload').set('Cookie', ownerCookie);
      expect(missingCsrf.status).toBe(403);

      const upload = vi.spyOn(storageService, 'processAndStoreImage').mockRejectedValue(new ServiceUnavailableError('Supabase Storage is unavailable.', 'STORAGE_UNAVAILABLE'));
      const result = await request(app).post('/api/admin/media/upload').set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf)
        .attach('images', Buffer.from('not-an-image'), 'fake.jpg');
      expect(result.status).toBe(503);
      expect(result.body.success).not.toBe(true);
      upload.mockRestore();
    });
  });

  describe('5. Order Management & Status Transitions', () => {
    it('GET /api/admin/orders reports unavailable Supabase storage instead of returning fallback orders', async () => {
      const res = await request(app)
        .get('/api/admin/orders')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    });
  });

  describe('6. Coupons Management', () => {
    it('rejects coupon reads without authentication', async () => {
      const res = await request(app).get('/api/admin/coupons');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/coupons lists launch coupons', async () => {
      const res = await request(app)
        .get('/api/admin/coupons')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('allows an authenticated staff member to create and update a coupon via the API contract', async () => {
      const created = await request(app).post('/api/admin/coupons').set('Cookie', staffCookie)
        .set('X-CSRF-Token', staffCsrf).send({ code: ' save10 ', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 150000, maxDiscountAmount: 25000 });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ code: 'SAVE10', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 150000, maxDiscountAmount: 25000, perCustomerLimit: 1 });

      const updated = await request(app).put('/api/admin/coupons/coupon-uuid-001').set('Cookie', staffCookie)
        .set('X-CSRF-Token', staffCsrf).send({ isActive: false });
      expect(updated.status).toBe(200);
      expect(updated.body.data.isActive).toBe(false);

      const legacyAliases = await request(app).put('/api/admin/coupons/coupon-uuid-001').set('Cookie', staffCookie)
        .set('X-CSRF-Token', staffCsrf).send({ type: 'FIXED', discountValue: 1200, minCartSubtotal: 5000, maxDiscount: 3000 });
      expect(legacyAliases.status).toBe(200);
      expect(legacyAliases.body.data).toMatchObject({ discountType: 'FLAT', type: 'FLAT', value: 1200, minOrderAmount: 5000, maxDiscountAmount: 3000 });
    });

    it('keeps coupon deletion owner-only', async () => {
      const res = await request(app).delete('/api/admin/coupons/coupon-uuid-001')
        .set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf);
      expect(res.status).toBe(403);
    });
  });

  describe('7. Events Management', () => {
    it('keeps event CRUD authenticated and preserves the admin event contract', async () => {
      const unauthenticated = await request(app).get('/api/admin/events');
      expect(unauthenticated.status).toBe(401);

      const created = await request(app).post('/api/admin/events').set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf).send({
        title: 'Courtyard Pop-Up', date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM', location: 'Chandigarh', description: 'A courtyard gathering.', image: '/event.webp', type: 'POP_UP', capacity: 80, registeredCount: 0, isRegistrationOpen: true,
      });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ id: 'event-uuid-001', image: '/event.webp', date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM' });

      const updated = await request(app).put('/api/admin/events/event-uuid-001').set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf).send({
        title: 'Courtyard Pop-Up', date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM', location: 'Chandigarh', description: 'Updated details.', image: '/event.webp', type: 'POP_UP', capacity: 80, registeredCount: 0, isRegistrationOpen: true,
      });
      expect(updated.status).toBe(200);
      expect(updated.body.data.description).toBe('Updated details.');

      const deletedByStaff = await request(app).delete('/api/admin/events/event-uuid-001').set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf);
      expect(deletedByStaff.status).toBe(403);
      const deletedByOwner = await request(app).delete('/api/admin/events/event-uuid-001').set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf);
      expect(deletedByOwner.status).toBe(200);
    });
  });

  describe('8. Rental Catalogue Management', () => {
    it('keeps rental catalogue CRUD authenticated and preserves pricing and availability fields', async () => {
      const unauthenticated = await request(app).get('/api/admin/rentals');
      expect(unauthenticated.status).toBe(401);

      const payload = { name: 'Courtyard Co-Ord Set', slug: 'courtyard-co-ord-set', category: 'rentals', image: '/rental.webp', rentalPrice3Days: 120000, rentalPrice7Days: 200000, rentalPrice14Days: 320000, securityDeposit: 300000, condition: 'Mint', size: 'Size M', isAvailable: true, description: 'Dry-cleaned before dispatch.' };
      const created = await request(app).post('/api/admin/rentals').set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf).send(payload);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ id: 'rental-uuid-001', image: '/rental.webp', rentalPrice3Days: 120000, rentalPrice7Days: 200000, rentalPrice14Days: 320000, securityDeposit: 300000 });

      const updated = await request(app).put('/api/admin/rentals/rental-uuid-001').set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf).send({ ...payload, isAvailable: false });
      expect(updated.status).toBe(200);
      expect(updated.body.data.isAvailable).toBe(false);
      const deletedByStaff = await request(app).delete('/api/admin/rentals/rental-uuid-001').set('Cookie', staffCookie).set('X-CSRF-Token', staffCsrf);
      expect(deletedByStaff.status).toBe(403);
      const deletedByOwner = await request(app).delete('/api/admin/rentals/rental-uuid-001').set('Cookie', ownerCookie).set('X-CSRF-Token', ownerCsrf);
      expect(deletedByOwner.status).toBe(200);
    });
  });

  describe('9. Admin Activity', () => {
    it('keeps activity listing owner-only', async () => {
      expect((await request(app).get('/api/admin/activity')).status).toBe(401);
      expect((await request(app).get('/api/admin/activity').set('Cookie', staffCookie)).status).toBe(403);
      const ownerRead = await request(app).get('/api/admin/activity').set('Cookie', ownerCookie);
      expect(ownerRead.status).toBe(200);
      expect(ownerRead.body.data).toEqual([]);
    });
  });
});

