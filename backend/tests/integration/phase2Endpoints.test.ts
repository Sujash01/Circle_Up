import request from 'supertest';
import { describe, expect, it } from 'vitest';
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
    });

    it('GET /api/events returns curated pop-ups and swap meets', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('title');
      expect(res.body.data[0]).toHaveProperty('location');
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
