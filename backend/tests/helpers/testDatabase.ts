import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Db } from 'mongodb';
import { Product } from '../../src/models/Product.js';
import { SEED_PRODUCTS } from '../../src/data/seedProducts.js';
import { CheckoutIdempotency } from '../../src/models/CheckoutIdempotency.js';
import { SiteSettings } from '../../src/models/SiteSettings.js';
import { migrateCheckoutIndexes } from '../../src/utils/checkoutIndexMigration.js';

export async function startTestDatabase(options: { installCheckoutIndexes?: boolean } = {}): Promise<MongoMemoryReplSet> {
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  if (options.installCheckoutIndexes !== false) {
    const database = mongoose.connection.db;
    if (!database) throw new Error('Test MongoDB database handle is unavailable.');
    await migrateCheckoutIndexes(database as unknown as Db, CheckoutIdempotency.collection.collectionName);
  }
  await Product.deleteMany({});
  await Product.insertMany(SEED_PRODUCTS.map((product) => ({ ...product, stock: 100 })));
  await SiteSettings.deleteMany({});
  await SiteSettings.create({ whatsappNumber: '+919111222333', isWhatsappVerified: true });
  return replicaSet;
}

export async function stopTestDatabase(replicaSet: MongoMemoryReplSet): Promise<void> {
  await mongoose.disconnect();
  await replicaSet.stop();
}
