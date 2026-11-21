import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { signSessionToken } from '../../src/services/adminAuth.service.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/testDatabase.js';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { Coupon } from '../../src/models/Coupon.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { CheckoutIdempotency } from '../../src/models/CheckoutIdempotency.js';
import { createHash } from 'crypto';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { migrateCheckoutIndexes } from '../../src/utils/checkoutIndexMigration.js';
import { SiteSettings } from '../../src/models/SiteSettings.js';
import { env } from '../../src/config/env.js';

const app = createApp();
let checkoutIp = 10;
const checkoutRequest = () => request(app).post('/api/v1/orders').set('X-Forwarded-For', `192.0.2.${checkoutIp++}`);
const checkoutPayload = (items: Array<{ serialNumber: string; quantity: number }>, promoCode?: string, paymentMethod = 'WHATSAPP_UPI') => ({
  customer: { name: 'Regression Buyer', email: 'regression@example.com', phone: '+919876543210' },
  shippingAddress: { addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050' },
  items,
  paymentMethod,
  ...(promoCode ? { promoCode } : {}),
});
let testDatabase: MongoMemoryReplSet;
const ownerSession = signSessionToken({
  userId: 'phase1-owner',
  email: 'owner@circleuponline.com',
  name: 'Test Owner',
  role: 'owner',
  csrfToken: 'phase1-owner-csrf',
  expiresAt: Date.now() + 60_000,
});
const staffSession = signSessionToken({
  userId: 'phase1-staff',
  email: 'staff@circleuponline.com',
  name: 'Test Staff',
  role: 'staff',
  csrfToken: 'phase1-staff-csrf',
  expiresAt: Date.now() + 60_000,
});

let originalProvider: string | undefined;

beforeAll(async () => {
  originalProvider = env.CHECKOUT_PROVIDER;
  (env as any).CHECKOUT_PROVIDER = 'mongodb';
  testDatabase = await startTestDatabase({ installCheckoutIndexes: false });
}, 120_000);

afterAll(async () => {
  (env as any).CHECKOUT_PROVIDER = originalProvider;
  if (testDatabase) await stopTestDatabase(testDatabase);
});

describe('Products & Orders API', () => {
  it('disables automatic indexes and installs checkout indexes only through migration', async () => {
    expect(mongoose.get('autoIndex')).toBe(false);
    expect(CheckoutIdempotency.schema.options.autoIndex).toBe(false);
    const database = mongoose.connection.db!;
    const collectionName = CheckoutIdempotency.collection.collectionName;
    const exists = await database.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
    if (!exists) await database.createCollection(collectionName);
    const before = await database.collection(collectionName).listIndexes().toArray();
    expect(before.map((index) => index.name)).toEqual(['_id_']);
    await migrateCheckoutIndexes(database as unknown as Db, collectionName);
    await migrateCheckoutIndexes(database as unknown as Db, collectionName);
    const after = await database.collection(collectionName).listIndexes().toArray();
    expect(after.some((index) => index.key.keyHash === 1 && index.unique === true)).toBe(true);
    expect(after.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
  });

  it('preflights malformed records and conflicting expiry indexes before creating any index', async () => {
    const database = mongoose.connection.db!;
    const malformedName = 'checkout_migration_malformed_test';
    const malformed = database.collection(malformedName);
    await malformed.insertOne({ keyHash: 'bad', fingerprint: 'bad', orderNumber: 'bad', expiresAt: 'not-a-date' });
    await expect(migrateCheckoutIndexes(database as unknown as Db, malformedName)).rejects.toThrow(/invalid keyHash/);
    expect((await malformed.listIndexes().toArray()).map((index) => index.name)).toEqual(['_id_']);
    await database.dropCollection(malformedName);

    const invalidCases = [
      { field: 'fingerprint', value: 'not-a-hash' },
      { field: 'orderNumber', value: 'not-an-order-number' },
      { field: 'expiresAt', value: 'not-a-date' },
    ] as const;
    for (const [index, invalid] of invalidCases.entries()) {
      const collectionName = `checkout_migration_invalid_${index}`;
      const collection = database.collection(collectionName);
      await collection.insertOne({
        keyHash: 'c'.repeat(64),
        fingerprint: 'd'.repeat(64),
        orderNumber: 'ORD-261118-9876',
        expiresAt: new Date(Date.now() + 86_400_000),
        [invalid.field]: invalid.value,
      });
      await expect(migrateCheckoutIndexes(database as unknown as Db, collectionName)).rejects.toThrow(`invalid ${invalid.field}`);
      expect((await collection.listIndexes().toArray()).map((indexDescription) => indexDescription.name)).toEqual(['_id_']);
      await database.dropCollection(collectionName);
    }

    const duplicateName = 'checkout_migration_duplicates_test';
    const duplicates = database.collection(duplicateName);
    const duplicateHash = 'a'.repeat(64);
    const validRecord = { keyHash: duplicateHash, fingerprint: 'b'.repeat(64), orderNumber: 'ORD-261118-1234', expiresAt: new Date(Date.now() + 86_400_000) };
    await duplicates.insertMany([validRecord, { ...validRecord, orderNumber: 'ORD-261118-5678' }]);
    await expect(migrateCheckoutIndexes(database as unknown as Db, duplicateName)).rejects.toThrow(/unique SHA-256/);
    expect((await duplicates.listIndexes().toArray()).map((index) => index.name)).toEqual(['_id_']);
    await database.dropCollection(duplicateName);

    const conflictName = 'checkout_migration_conflict_test';
    const conflict = database.collection(conflictName);
    await conflict.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 86400, name: 'wrong_expiry_ttl' });
    await expect(migrateCheckoutIndexes(database as unknown as Db, conflictName)).rejects.toThrow(/incompatible fields or options/);
    const indexes = await conflict.listIndexes().toArray();
    expect(indexes.some((index) => index.key.keyHash === 1)).toBe(false);
    await database.dropCollection(conflictName);
  });

  it('protects legacy product mutations with admin auth and CSRF checks', async () => {
    const create = await request(app).post('/api/v1/products').send({ name: 'Unauthorized item' });
    const update = await request(app).put('/api/products/CU-001').send({ price: 1 });
    const remove = await request(app).delete('/api/v1/products/CU-001');
    const seedAsStaff = await request(app)
      .post('/api/products/seed')
      .set('Authorization', `Bearer ${staffSession}`)
      .set('X-CSRF-Token', 'phase1-staff-csrf');
    const createWithoutCsrf = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerSession}`)
      .send({ name: 'Missing CSRF', price: 100, stock: 1 });
    const createAsStaff = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${staffSession}`)
      .set('X-CSRF-Token', 'phase1-staff-csrf')
      .send({ serialNumber: 'AUTH-001', name: 'Authorized test item', description: 'Test fixture', price: 150000, stock: 2 });
    const updateAsOwner = await request(app)
      .put('/api/products/AUTH-001')
      .set('Authorization', `Bearer ${ownerSession}`)
      .set('X-CSRF-Token', 'phase1-owner-csrf')
      .send({ price: 175000 });
    const removeAsOwner = await request(app)
      .delete('/api/v1/products/AUTH-001')
      .set('Authorization', `Bearer ${ownerSession}`)
      .set('X-CSRF-Token', 'phase1-owner-csrf');

    expect([create.status, update.status, remove.status]).toEqual([401, 401, 401]);
    expect(createWithoutCsrf.status).toBe(403);
    expect(createWithoutCsrf.body.error.code).toBe('INVALID_CSRF_TOKEN');
    expect(seedAsStaff.status).toBe(403);
    expect(seedAsStaff.body.error.code).toBe('FORBIDDEN_ROLE');
    expect(createAsStaff.status, JSON.stringify(createAsStaff.body)).toBe(201);
    expect(updateAsOwner.status).toBe(200);
    expect(removeAsOwner.status).toBe(200);
  });

  it('GET /api/v1/products returns list of products with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/products');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
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

    const res = await checkoutRequest().set('Idempotency-Key', 'product-order-key-0001').send(orderPayload);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('orderNumber');
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    expect(res.body.data.customer.name).toBe('Tara Mehta');
    expect(res.body.data.paymentMethod).toBe('WHATSAPP_UPI');
    expect(res.body.data.paymentStatus).toBe('PENDING');
  });

  it('creates COD orders with pending payment status', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'cod-pending-confirmation-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }], undefined, 'CASH_ON_DELIVERY'));
    expect(res.status).toBe(201);
    expect(res.body.data.paymentMethod).toBe('CASH_ON_DELIVERY');
    expect(res.body.data.paymentStatus).toBe('PENDING');
  });

  it('rejects WhatsApp / UPI checkout when no store contact is configured without reserving stock', async () => {
    const settings = await SiteSettings.findOne();
    expect(settings).not.toBeNull();
    await SiteSettings.updateOne({ _id: settings!._id }, { $set: { whatsappNumber: '', isWhatsappVerified: false } });
    const beforeStock = (await Product.findOne({ serialNumber: 'CU-001' }))!.stock;
    const beforeOrders = await Order.countDocuments();
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'whatsapp-unconfigured-key-001')
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
      const afterStock = (await Product.findOne({ serialNumber: 'CU-001' }))!.stock;
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      expect(afterStock).toBe(beforeStock);
      expect(await Order.countDocuments()).toBe(beforeOrders);
    } finally {
      await SiteSettings.updateOne({ _id: settings!._id }, { $set: { whatsappNumber: '+919111222333', isWhatsappVerified: true } });
    }
  });

  it('rejects unsupported payment methods at the shared checkout schema', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'unsupported-payment-method-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }], undefined, 'WHATSAPP_BANK_TRANSFER'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/orders rejects unknown products instead of assigning a fallback price', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'unknown-product-key-0002').send({
      customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+919876543210' },
      shippingAddress: {
        addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
      },
      items: [{ serialNumber: 'UNKNOWN-ITEM', quantity: 1 }],
      paymentMethod: 'WHATSAPP_UPI',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_ORDERABLE');
  });

  it('rejects online payment without a verified payment flow and does not persist an order', async () => {
    const before = await (await import('../../src/models/Order.js')).Order.countDocuments();
    const res = await checkoutRequest().set('Idempotency-Key', 'online-payment-key-0003').send({
      customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+919876543210' },
      shippingAddress: {
        addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
      },
      items: [{ serialNumber: 'CU-001', quantity: 1 }],
      paymentMethod: 'ONLINE_UPI',
    });
    const after = await (await import('../../src/models/Order.js')).Order.countDocuments();

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
    expect(after).toBe(before);
  });

  it('records WhatsApp payment as paid only through owner-authenticated, CSRF-protected verification', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'admin-verified-payment-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    expect(created.status).toBe(201);
    expect(created.body.data.paymentStatus).toBe('PENDING');

    const forbidden = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${staffSession}`).set('X-CSRF-Token', 'phase1-staff-csrf').send({ paymentStatus: 'PAID' });
    expect(forbidden.status).toBe(403);

    const missingCsrf = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).send({ paymentStatus: 'PAID' });
    expect(missingCsrf.status).toBe(403);

    const verified = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.paymentStatus).toBe('PAID');
    expect(await AuditLog.countDocuments({ action: 'ORDER_PAYMENT_VERIFIED', entityId: created.body.data.orderNumber })).toBe(1);

    const duplicateVerification = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(duplicateVerification.status).toBe(400);
    expect(duplicateVerification.body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(await AuditLog.countDocuments({ action: 'ORDER_PAYMENT_VERIFIED', entityId: created.body.data.orderNumber })).toBe(1);
  });

  it('rejects manual payment for cancelled orders and unsupported methods', async () => {
    const cancelled = await checkoutRequest().set('Idempotency-Key', 'cancelled-payment-key-001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    for (const status of ['CANCELLED', 'REFUNDED', 'FAILED', 'PENDING']) {
      await Order.updateOne({ orderNumber: cancelled.body.data.orderNumber }, { $set: { status, paymentStatus: 'PENDING' } });
      const invalidStateAttempt = await request(app).put(`/api/v1/admin/orders/${cancelled.body.data.orderNumber}/payment-status`)
        .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
      expect(invalidStateAttempt.status).toBe(400);
      expect(invalidStateAttempt.body.error.code).toBe('INVALID_PAYMENT_ORDER_STATE');
    }

    const unsupported = await checkoutRequest().set('Idempotency-Key', 'unsupported-payment-key-001')
      .send(checkoutPayload([{ serialNumber: 'CU-002', quantity: 1 }]));
    await Order.updateOne({ orderNumber: unsupported.body.data.orderNumber }, { $set: { paymentMethod: 'ONLINE_UPI' } });
    const unsupportedAttempt = await request(app).put(`/api/v1/admin/orders/${unsupported.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(unsupportedAttempt.status).toBe(400);
    expect(unsupportedAttempt.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    const invalidMethod = await checkoutRequest().set('Idempotency-Key', 'invalid-method-payment-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-003', quantity: 1 }]));
    await Order.updateOne({ orderNumber: invalidMethod.body.data.orderNumber }, { $set: { paymentMethod: 'UNKNOWN_METHOD' } });
    const invalidMethodAttempt = await request(app).put(`/api/v1/admin/orders/${invalidMethod.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(invalidMethodAttempt.status).toBe(400);
    expect(invalidMethodAttempt.body.error.code).toBe('INVALID_MANUAL_PAYMENT_METHOD');
  });

  it('allows an owner to record a COD payment after collection', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'cod-payment-verified-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-002', quantity: 1 }], undefined, 'CASH_ON_DELIVERY'));
    expect(created.status).toBe(201);
    const verified = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
      .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.paymentMethod).toBe('CASH_ON_DELIVERY');
    expect(verified.body.data.paymentStatus).toBe('PAID');
  });

  it('rolls back payment status when its required audit event cannot be written', async () => {
    const created = await checkoutRequest().set('Idempotency-Key', 'audit-failure-payment-key-01')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const auditSpy = vi.spyOn(AuditLog, 'create').mockRejectedValue(new Error('injected audit persistence failure'));
    try {
      const res = await request(app).put(`/api/v1/admin/orders/${created.body.data.orderNumber}/payment-status`)
        .set('Authorization', `Bearer ${ownerSession}`).set('X-CSRF-Token', 'phase1-owner-csrf').send({ paymentStatus: 'PAID' });
      expect(res.status).toBe(500);
      expect((await Order.findOne({ orderNumber: created.body.data.orderNumber }))?.paymentStatus).toBe('PENDING');
      expect(await AuditLog.countDocuments({ action: 'ORDER_PAYMENT_VERIFIED', entityId: created.body.data.orderNumber })).toBe(0);
    } finally {
      auditSpy.mockRestore();
    }
  });

  it.each(['DRAFT', 'ARCHIVED', 'MISSING', 'NEED_ATTENTION', 'SOLD_OUT'])(
    'rejects product status %s during checkout', async (status) => {
      await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { status, stock: 5, deletedAt: null } });
      const res = await checkoutRequest().set('Idempotency-Key', `status-test-${status.toLowerCase()}-0001`)
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_ORDERABLE');
      await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { status: 'AVAILABLE', stock: 100 } });
    },
  );

  it('rejects deleted products during checkout', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { deletedAt: new Date() } });
    const res = await checkoutRequest().set('Idempotency-Key', 'deleted-product-key-0001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_ORDERABLE');
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { deletedAt: null } });
  });

  it.each([0, -1, 1.5])('rejects invalid checkout quantity %s', async (quantity) => {
    const res = await checkoutRequest().set('Idempotency-Key', `invalid-quantity-${String(quantity).replace('.', '-')}-0001`)
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity }]));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unexpected client price and payment fields', async () => {
    const res = await checkoutRequest().set('Idempotency-Key', 'unexpected-fields-key-001')
      .send({ ...checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]), paymentStatus: 'PAID', totalAmount: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid stored prices before reserving stock', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { price: 1.5, stock: 8 } });
    const res = await checkoutRequest().set('Idempotency-Key', 'invalid-price-key-0001')
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_PRODUCT_PRICE');
    expect((await Product.findOne({ serialNumber: 'CU-001' }))?.stock).toBe(8);
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { price: 4000, stock: 100 } });
  });

  it('rolls back all inventory when order persistence fails after reservation', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 7, status: 'AVAILABLE' } });
    await Product.updateOne({ serialNumber: 'CU-002' }, { $set: { stock: 9, status: 'AVAILABLE' } });
    const createSpy = vi.spyOn(Order, 'create').mockRejectedValue(new Error('injected order persistence failure'));
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'rollback-order-key-0001')
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 2 }, { serialNumber: 'CU-002', quantity: 3 }]));
      expect(res.status).toBe(500);
      expect((await Product.findOne({ serialNumber: 'CU-001' }))?.stock).toBe(7);
      expect((await Product.findOne({ serialNumber: 'CU-002' }))?.stock).toBe(9);
      const idemHash = createHash('sha256').update('rollback-order-key-0001').digest('hex');
      expect(await CheckoutIdempotency.countDocuments({ keyHash: idemHash })).toBe(0);
    } finally {
      createSpy.mockRestore();
      await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 100, status: 'AVAILABLE' } });
      await Product.updateOne({ serialNumber: 'CU-002' }, { $set: { stock: 100, status: 'AVAILABLE' } });
    }
  });

  it('rolls back coupon usage when persistence fails after coupon reservation', async () => {
    await Coupon.create({ code: 'ROLLBACK10', discountType: 'PERCENTAGE', value: 10, minOrderAmount: 0, usageCount: 0, usageLimit: 5, isActive: true });
    const createSpy = vi.spyOn(Order, 'create').mockRejectedValue(new Error('injected order persistence failure'));
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'rollback-coupon-key-0001')
        .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }], 'ROLLBACK10'));
      expect(res.status).toBe(500);
      expect((await Coupon.findOne({ code: 'ROLLBACK10' }))?.usageCount).toBe(0);
    } finally {
      createSpy.mockRestore();
      await Coupon.deleteOne({ code: 'ROLLBACK10' });
    }
  });

  it('does not oversell the last item when two different checkouts race', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 1, status: 'AVAILABLE' } });
    const before = await Order.countDocuments();
    const submit = (key: string) => checkoutRequest().set('Idempotency-Key', key)
      .send(checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]));
    const results = await Promise.all([submit('concurrent-checkout-key-001'), submit('concurrent-checkout-key-002')]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(await Product.findOne({ serialNumber: 'CU-001' }).then((product) => product?.stock)).toBe(0);
    expect(await Order.countDocuments()).toBe(before + 1);
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 100, status: 'AVAILABLE' } });
  });

  it('replays duplicate checkout keys without creating a second order or deducting stock twice', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 5, status: 'AVAILABLE' } });
    const before = await Order.countDocuments();
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const first = await checkoutRequest().set('Idempotency-Key', 'duplicate-checkout-key-01').send(payload);
    const second = await checkoutRequest().set('Idempotency-Key', 'duplicate-checkout-key-01').send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);
    expect(second.body.data.guestAccessToken).toBe(first.body.data.guestAccessToken);
    expect(await Order.countDocuments()).toBe(before + 1);
    expect((await Product.findOne({ serialNumber: 'CU-001' }))?.stock).toBe(4);
  });

  it('rejects reusing an idempotency key with a different request fingerprint', async () => {
    const key = 'fingerprint-mismatch-key-001';
    const original = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const first = await checkoutRequest().set('Idempotency-Key', key).send(original);
    const changed = { ...original, notes: 'Different customer instruction' };
    const second = await checkoutRequest().set('Idempotency-Key', key).send(changed);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('allows the same key to retry successfully after a rolled back checkout', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 6, status: 'AVAILABLE' } });
    const key = 'retry-after-abort-key-01';
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 2 }]);
    const orderCreateSpy = vi.spyOn(Order, 'create').mockRejectedValueOnce(new Error('injected transient persistence failure'));
    const failed = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    orderCreateSpy.mockRestore();
    expect(failed.status).toBe(500);
    const retry = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    expect(retry.status).toBe(201);
    expect((await Product.findOne({ serialNumber: 'CU-001' }))?.stock).toBe(4);
    expect(await Order.countDocuments({ orderNumber: retry.body.data.orderNumber })).toBe(1);
  });

  it('does not replay an expired idempotency record and creates a fresh order', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 5, status: 'AVAILABLE' } });
    const key = 'expired-idempotency-key-001';
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const first = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    expect(first.status).toBe(201);
    const keyHash = createHash('sha256').update(key).digest('hex');
    await CheckoutIdempotency.updateOne({ keyHash }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const second = await checkoutRequest().set('Idempotency-Key', key).send(payload);
    expect(second.status).toBe(201);
    expect(second.body.data.orderNumber).not.toBe(first.body.data.orderNumber);
    expect(await Order.countDocuments({ orderNumber: first.body.data.orderNumber })).toBe(1);
    expect((await Product.findOne({ serialNumber: 'CU-001' }))?.stock).toBe(3);
    expect(await CheckoutIdempotency.countDocuments({ keyHash })).toBe(1);
    expect(await CheckoutIdempotency.findOne({ keyHash }).then((record) => record?.expiresAt.getTime())).toBeGreaterThan(Date.now());
  });

  it('serializes concurrent submissions sharing one idempotency key', async () => {
    await Product.updateOne({ serialNumber: 'CU-001' }, { $set: { stock: 5, status: 'AVAILABLE' } });
    const before = await Order.countDocuments();
    const payload = checkoutPayload([{ serialNumber: 'CU-001', quantity: 1 }]);
    const submit = () => checkoutRequest().set('Idempotency-Key', 'concurrent-same-key-001').send(payload);
    const [first, second] = await Promise.all([submit(), submit()]);
    expect([first.status, second.status].filter((status) => status === 201)).toHaveLength(1);
    expect([first.status, second.status].every((status) => status === 201 || status === 409)).toBe(true);
    expect(await Order.countDocuments()).toBe(before + 1);
    expect((await Product.findOne({ serialNumber: 'CU-001' }))?.stock).toBe(4);
    const retry = await submit();
    expect(retry.status).toBe(201);
    expect(await Order.countDocuments()).toBe(before + 1);
  });

  it('fails checkout when MongoDB is unavailable and creates no simulated order', async () => {
    const mongoose = (await import('mongoose')).default;
    await mongoose.disconnect();
    try {
      const res = await checkoutRequest().set('Idempotency-Key', 'offline-checkout-key-0004').send({
        customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+919876543210' },
        shippingAddress: {
          addressLine: '42 Test Lane', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050',
        },
        items: [{ serialNumber: 'NOT-IN-CATALOG', quantity: 1 }],
        paymentMethod: 'WHATSAPP_UPI',
      });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
      expect(res.body.data).toBeUndefined();
    } finally {
      await mongoose.connect(testDatabase.getUri());
    }
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

