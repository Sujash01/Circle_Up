import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { productService } from '../modules/products/product.service.js';

async function runSeed() {
  logger.info({ uri: env.MONGODB_URI.replace(/:[^:]*@/, ':****@') }, 'Connecting to MongoDB for catalog seed...');
  await connectDatabase();
  const result = await productService.seedCatalog();
  logger.info(result, 'Catalog seeding completed');
  await disconnectDatabase();
  process.exit(0);
}

runSeed().catch(async (err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'Failed to seed catalog');
  await disconnectDatabase();
  process.exit(1);
});

