/**
 * CircleUp – Production Migration: Legacy Guest Token SHA-256 Hashing
 * 
 * Safe, idempotent migration script to transition all legacy plaintext
 * guest access tokens in MongoDB to cryptographically secure SHA-256 hashes.
 * 
 * Usage:
 *   node scripts/migrateGuestTokens.mjs
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment or backend/.env');
  process.exit(1);
}

function hashGuestToken(token) {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

async function runMigration() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  const db = mongoose.connection.db;
  const ordersCollection = db.collection('orders');

  // Query: Find all orders that have a plaintext guestAccessToken but no guestAccessTokenHash
  const query = {
    guestAccessToken: { $ne: null },
    guestAccessTokenHash: null,
  };

  const cursor = ordersCollection.find(query);
  let totalFound = await ordersCollection.countDocuments(query);
  console.log(`📋 Found ${totalFound} legacy guest orders requiring SHA-256 token hashing.`);

  if (totalFound === 0) {
    console.log('✨ All guest order tokens are already hashed. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  let migratedCount = 0;
  for await (const order of cursor) {
    const rawToken = order.guestAccessToken;
    if (typeof rawToken === 'string' && rawToken.trim().length > 0) {
      const tokenHash = hashGuestToken(rawToken);
      await ordersCollection.updateOne(
        { _id: order._id },
        {
          $set: {
            guestAccessTokenHash: tokenHash,
            guestAccessToken: tokenHash, // Replace plaintext with hash for legacy schema compatibility
          },
        }
      );
      migratedCount++;
      if (migratedCount % 100 === 0 || migratedCount === totalFound) {
        console.log(`   Migrated ${migratedCount} / ${totalFound} orders...`);
      }
    }
  }

  console.log(`🎉 Migration successfully complete. Hashed ${migratedCount} guest access tokens.`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB.');
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
