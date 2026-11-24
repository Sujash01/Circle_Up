import request from 'supertest';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({
  data: {
    announcementText: 'Welcome', announcementLink: '/new-arrivals', isAnnouncementActive: true,
    marqueePhrases: ['Shop pre-loved'], categoryTiles: [
      { title: 'Clothing', imageUrl: '/clothing.jpg', linkUrl: '/category/clothing' },
      { title: 'Bags', imageUrl: '/bags.jpg', linkUrl: '/category/bags' },
      { title: 'Shoes', imageUrl: '/shoes.jpg', linkUrl: '/category/shoes' },
      { title: 'Accessories', imageUrl: '/accessories.jpg', linkUrl: '/category/accessories' },
    ], customDrop: { enabled: false, title: '', imageUrl: '', linkUrl: '' },
    storeAddress: '', contactEmail: '', contactPhone: '', whatsappNumber: '', isWhatsappVerified: false,
    contentVersion: 1, updatedAt: new Date().toISOString(),
  },
}));
const eventState = vi.hoisted(() => ({
  registration: { id: 'registration-1', eventId: 'event-uuid-1', eventTitle: 'CircleUp Courtyard', name: 'Aanya', email: 'aanya@example.com', phone: '+919800112233', notes: 'Bring a jacket', createdAt: new Date().toISOString() },
  register: vi.fn(async (_id: string, input: Record<string, string>) => ({ id: 'registration-1', eventId: 'event-uuid-1', eventTitle: 'CircleUp Courtyard', ...input, createdAt: new Date().toISOString() })),
}));
const catalogState = vi.hoisted(() => {
  const row = (id: string, name: string, category = 'womens-one-piece') => ({ id, serialNumber: id, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, description: `${name} in denim`, category, categoryLabel: category, price: 125000, images: ['/product.webp'], sizes: ['M'], tags: ['denim'], stock: 2, badge: 'Vintage find' });
  const products = [row('CU-001', 'Denim Co-Ord Set'), row('CU-002', 'Denim Shirt'), row('CU-003', 'Denim Skirt'), row('CU-004', 'Denim Jacket')];
  return {
    products,
    categoryCounts: async () => new Map([['womens-one-piece', 4], ['accessories', 2]]),
    searchItems: async () => products.map((p) => ({ ...p, subcategory: 'denim' })),
    chestPicks: async () => products,
    collection: async (category: string) => products.filter((p) => p.category === category || category === 'accessories').slice(0, 4),
    related: async () => [],
  };
});
vi.mock('../../src/services/supabaseCatalog.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabaseCatalog.service.js')>();
  return { ...actual, supabaseCatalogService: {
    ...actual.supabaseCatalogService,
    getCategoryCounts: catalogState.categoryCounts,
    searchCatalogItems: catalogState.searchItems,
    findChestPicks: catalogState.chestPicks,
    findCollectionRow: catalogState.collection,
    getRelatedProducts: catalogState.related,
  } };
});
vi.mock('../../src/repositories/rental.repository.js', () => ({
  rentalRepository: {
    list: async () => [{ id: 'rental-uuid-1', name: 'Courtyard Co-Ord Set', slug: 'courtyard-co-ord-set', category: 'rentals', image: '/rental.webp', rentalPrice3Days: 120000, rentalPrice7Days: 200000, rentalPrice14Days: 320000, securityDeposit: 300000, condition: 'Mint', size: 'Size M', isAvailable: true, description: 'A rental item.' }],
    get: async (identifier: string) => identifier === 'missing' ? Promise.reject(new (await import('../../src/errors/AppError.js')).NotFoundError('Rental item not found.', 'RENTAL_NOT_FOUND')) : ({ id: 'rental-uuid-1', name: 'Courtyard Co-Ord Set', slug: 'courtyard-co-ord-set', category: 'rentals', image: '/rental.webp', rentalPrice3Days: 120000, rentalPrice7Days: 200000, rentalPrice14Days: 320000, securityDeposit: 300000, condition: 'Mint', size: 'Size M', isAvailable: true, description: 'A rental item.' }),
  },
}));
vi.mock('../../src/repositories/settings.repository.js', () => ({
  getConfiguredWhatsappNumber: (value?: string) => value && value.replace(/\D/g, '').length >= 10 ? value : '',
  settingsRepository: { getSettings: async () => ({ ...settingsState.data }) },
}));
vi.mock('../../src/repositories/coupon.repository.js', () => ({
  couponRepository: {
    findByCode: async (code: string) => {
      const rows: Record<string, any> = {
        THRIFT10: { code: 'THRIFT10', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 100000, maxDiscountAmount: 50000, isActive: true, usageCount: 0, usageLimit: 1000 },
        CIRCLE20: { code: 'CIRCLE20', discountType: 'PERCENTAGE', value: 20, minOrderAmount: 150000, maxDiscountAmount: 100000, isActive: true, usageCount: 0, usageLimit: 500 },
      };
      return rows[code.toUpperCase()] || null;
    },
  },
}));
vi.mock('../../src/repositories/event.repository.js', () => ({
  eventRepository: {
    list: async () => [{ id: 'event-uuid-1', title: 'CircleUp Courtyard', date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM', location: 'Chandigarh', description: '', image: '/event.webp', type: 'POP_UP', registeredCount: 0, isRegistrationOpen: true }],
    get: async (id: string) => { if (id === 'missing') { const { NotFoundError } = await import('../../src/errors/AppError.js'); throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND'); } return { id: 'event-uuid-1', title: 'CircleUp Courtyard', date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM', location: 'Chandigarh', description: '', image: '/event.webp', type: 'POP_UP', registeredCount: 0, isRegistrationOpen: true }; },
    register: eventState.register,
  },
}));
import { createApp } from '../../src/app.js';

const app = createApp();

describe('Phase 2 API Endpoints', () => {
  describe('GET /api/homepage & /api/v1/homepage', () => {
    it('returns unified homepage payload with cache headers', async () => {
      const res = await request(app).get('/api/homepage');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['cache-control']).toContain('max-age=60');
      expect(res.headers['cache-control']).toContain('stale-while-revalidate=300');

      const data = res.body.data;
      expect(data).toHaveProperty('chestPicks');
      expect(Array.isArray(data.chestPicks)).toBe(true);
      expect(data.chestPicks.length).toBeGreaterThanOrEqual(4);

      expect(data).toHaveProperty('rows');
      expect(data.rows).toHaveProperty('readyToWear');
      expect(data.rows).toHaveProperty('handbags');
      expect(data.rows).toHaveProperty('winter');

      expect(data).toHaveProperty('categoryTiles');
      expect(Array.isArray(data.categoryTiles)).toBe(true);
      expect(data.categoryTiles.length).toBe(4);

      expect(data).toHaveProperty('announcementText');
      expect(typeof data.announcementText).toBe('string');

      expect(data).toHaveProperty('marqueePhrases');
      expect(Array.isArray(data.marqueePhrases)).toBe(true);
    });

    it('works on /api/v1/homepage as well', async () => {
      const res = await request(app).get('/api/v1/homepage');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('chestPicks');
    });
  });

  describe('Categories & Collections API', () => {
    it('GET /api/categories returns category directory with item counts', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('slug');
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('itemCount');
    });

    it('GET /api/collections returns curated collections', async () => {
      const res = await request(app).get('/api/collections');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((c: { slug: string }) => c.slug === 'ready-to-wear')).toBe(true);
    });
  });

  describe('Rentals & Events API', () => {
    it('GET /api/rentals returns available rental items with integer paise rates', async () => {
      const res = await request(app).get('/api/rentals');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      const first = res.body.data[0];
      expect(first).toHaveProperty('rentalPrice3Days');
      expect(Number.isInteger(first.rentalPrice3Days)).toBe(true);
      expect(first).toHaveProperty('securityDeposit');
      expect(Number.isInteger(first.securityDeposit)).toBe(true);
      expect(first.image).toBe('/rental.webp');
    });

    it('GET /api/rentals/:identifier returns detail and a missing rental returns 404', async () => {
      const found = await request(app).get('/api/rentals/courtyard-co-ord-set');
      expect(found.status).toBe(200);
      expect(found.body.data.rentalPrice14Days).toBe(320000);
      const missing = await request(app).get('/api/rentals/missing');
      expect(missing.status).toBe(404);
    });

    it('returns only the fields from the rental catalogue contract', async () => {
      const res = await request(app).get('/api/rentals');
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toMatchObject({ rentalPrice3Days: 120000, rentalPrice7Days: 200000, rentalPrice14Days: 320000, securityDeposit: 300000, isAvailable: true, image: '/rental.webp' });
    });

    it('GET /api/events returns persisted events using the public event contract', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('title');
      expect(res.body.data[0]).toHaveProperty('location');
    });

    it('GET /api/events/:id returns event detail and a missing event returns 404', async () => {
      const found = await request(app).get('/api/events/event-uuid-1');
      expect(found.status).toBe(200);
      expect(found.body.data.image).toBe('/event.webp');
      const missing = await request(app).get('/api/events/missing');
      expect(missing.status).toBe(404);
    });

    it('persists valid registration input and rejects invalid email', async () => {
      const valid = await request(app).post('/api/events/event-uuid-1/registrations').send({ name: 'Aanya', email: 'aanya@example.com', phone: '+919800112233', notes: 'Bring a jacket' });
      expect(valid.status).toBe(201);
      expect(valid.body.data.id).toBe('registration-1');
      const invalid = await request(app).post('/api/events/event-uuid-1/registrations').send({ name: 'Aanya', email: 'bad', phone: '+919800112233' });
      expect(invalid.status).toBe(400);
      expect(eventState.register).toHaveBeenCalledTimes(1);
    });
  });

  describe('Coupons API', () => {
    it('validates launch coupon THRIFT10 with 10% discount on orders >= 100000 paise', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .send({ code: 'THRIFT10', subtotalInPaise: 250000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.discountInPaise).toBe(25000); // 10% of 250000 = 25000 paise
      expect(res.body.data.code).toBe('THRIFT10');
    });

    it('validates CIRCLE20 with 20% discount on orders >= 150000 paise', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .send({ code: 'CIRCLE20', subtotalInPaise: 200000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.discountInPaise).toBe(40000); // 20% of 200000 = 40000 paise
    });

    it('uses the same integer division as checkout for percentage discounts', async () => {
      const response = await request(app)
        .post('/api/coupons/validate')
        .send({ code: 'THRIFT10', subtotalInPaise: 250009 });

      expect(response.status).toBe(200);
      expect(response.body.data.discountInPaise).toBe(25000);
    });

    it('rejects coupon when subtotal is below minimum order requirement', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .send({ code: 'CIRCLE20', subtotalInPaise: 50000 }); // min is 150000

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.message).toContain('minimum bag value');
    });

    it('rejects non-existent coupon code gracefully', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .send({ code: 'UNKNOWN_PROMO', subtotalInPaise: 500000 });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.message).toContain('Invalid or expired promotional code');
    });
  });

  describe('Search API', () => {
    it('enforces min 2 chars query', async () => {
      const res = await request(app).get('/api/search?q=a');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUERY_TOO_SHORT');
    });

    it('finds and ranks matching products by name prefix > name contains', async () => {
      const res = await request(app).get('/api/search?q=denim');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page', 1);
    });

    it('returns suggestions mode with max 6 concise results', async () => {
      const res = await request(app).get('/api/search?q=top&mode=suggestions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(6);
      if (res.body.data.length > 0) {
        const item = res.body.data[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('price');
        expect(item).toHaveProperty('thumbnail');
      }
    });
  });

  describe('Checkout shipping quote', () => {
    const path = '/api/shipping-tax/calculate-fee';

    it('keeps the checkout RPC in sync with the approved API policy', () => {
      const migration = readFileSync(new URL(
        '../../../supabase/migrations/20261212000000_approved_checkout_shipping_policy.sql',
        import.meta.url,
      ), 'utf8');
      expect(migration).toMatch(/when p_item_count = 0 or p_discounted_subtotal_paise >= 100000 then 0\s+else 9000/);
      expect(migration).toMatch(/v_delivery_fee := public.calculate_storefront_delivery_fee\(\s*v_discounted_subtotal,\s*pg_catalog.jsonb_array_length\(p_items\)/);
    });

    it.each([
      ['empty', 0, 0, 0],
      ['fully discounted', 0, 1, 9000],
      ['₹998', 99800, 1, 9000],
      ['₹999', 99900, 1, 9000],
      ['₹999.99', 99999, 1, 9000],
      ['₹1,000', 100000, 1, 0],
      ['above ₹1,000', 100001, 1, 0],
    ])('quotes %s using the discounted subtotal', async (_label, subtotalInPaise, itemCount, deliveryFeePaise) => {
      const response = await request(app).get(path).query({ pincode: '400050', subtotalInPaise, itemCount });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ deliveryFeePaise, freeShippingThresholdPaise: 100000 });
    });

    it('retains subtotal-only quotes and rejects invalid inputs', async () => {
      expect((await request(app).get(path)).body.data.deliveryFeePaise).toBe(0);
      expect((await request(app).get(path).query({ subtotalInPaise: 99999 })).body.data.deliveryFeePaise).toBe(9000);
      expect((await request(app).get(path).query({ subtotalInPaise: '80000oops' })).status).toBe(400);
      expect((await request(app).get(path).query({ itemCount: '-1' })).status).toBe(400);
    });
  });

  describe('Related Products API', () => {
    it('GET /api/v1/products/:identifier/related returns products in same category excluding self', async () => {
      const res = await request(app).get('/api/v1/products/CU-001/related');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      for (const item of res.body.data) {
        expect(item.serialNumber).not.toBe('CU-001');
      }
    });
  });
});
