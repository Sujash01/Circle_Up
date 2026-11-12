import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('Products & Orders API', () => {
  it('GET /api/v1/products returns list of products with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page', 1);

    const first = res.body.data[0];
    expect(first).toHaveProperty('serialNumber');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('price');
    expect(first).toHaveProperty('stock');
    expect(first).toHaveProperty('images');
    expect(first).toHaveProperty('sizes');
  });

  it('GET /api/v1/products with category and search filter', async () => {
    const res = await request(app).get('/api/v1/products?search=skirt&sort=price-asc');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const item of res.body.data) {
      expect(
        item.name.toLowerCase().includes('skirt') ||
          item.description?.toLowerCase().includes('skirt') ||
          item.tags?.some((t: string) => t.includes('skirt')),
      ).toBe(true);
    }
  });

  it('GET /api/v1/products/:identifier resolves by serialNumber or slug', async () => {
    const bySerial = await request(app).get('/api/v1/products/CU-001');
    expect(bySerial.status).toBe(200);
    expect(bySerial.body.success).toBe(true);
    expect(bySerial.body.data.serialNumber).toBe('CU-001');
    expect(bySerial.body.data.name).toBe('Top & Skirt Co-Ord Set');

    const bySlug = await request(app).get('/api/v1/products/top-and-skirt-co-ord-set');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.success).toBe(true);
    expect(bySlug.body.data.serialNumber).toBe('CU-001');
  });

  it('POST /api/v1/orders places an order and returns confirmation with orderNumber', async () => {
    const orderPayload = {
      customer: {
        name: 'Tara Mehta',
        email: 'tara.mehta@example.com',
        phone: '+919876543210',
      },
      shippingAddress: {
        addressLine: '42 Vintage Lane, Bandra West',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
      },
      items: [
        {
          serialNumber: 'CU-001',
          quantity: 1,
          size: 'M',
        },
      ],
      paymentMethod: 'WHATSAPP_UPI',
      notes: 'Please ring bell upon delivery',
    };

    const res = await request(app).post('/api/v1/orders').send(orderPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('orderNumber');
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    expect(res.body.data.customer.name).toBe('Tara Mehta');
  });

  it('POST /api/v1/contact accepts general store inquiry', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Rohan Sen',
      email: 'rohan.sen@example.com',
      subject: 'Inquiry about Vintage Denim Sizing',
      message: 'Hello, what are the shoulder measurements on CU-002?',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

