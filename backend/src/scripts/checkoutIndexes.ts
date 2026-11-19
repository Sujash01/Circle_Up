import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { CheckoutIdempotency } from '../models/CheckoutIdempotency.js';
import { migrateCheckoutIndexes as runCheckoutIndexMigration } from '../utils/checkoutIndexMigration.js';

async function migrateCheckoutIndexes(): Promise<void> {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI must be configured to run checkout index migration.');
  await connectDatabase();

  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('Connected MongoDB database handle is unavailable.');
    const collectionName = CheckoutIdempotency.collection.collectionName;
    await runCheckoutIndexMigration(database as unknown as Db, collectionName);
    logger.info('Checkout idempotency unique and TTL indexes are installed');
  } finally {
    await disconnectDatabase();
  }
}

migrateCheckoutIndexes().catch((error: unknown) => {
  logger.error({ err: error }, 'Checkout index migration failed');
  process.exitCode = 1;
});
