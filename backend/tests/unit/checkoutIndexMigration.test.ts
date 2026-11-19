import type { Db, IndexDescription } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { migrateCheckoutIndexes } from '../../src/utils/checkoutIndexMigration.js';

function makeMigrationHarness(onCreate: (key: Record<string, number>, indexes: IndexDescription[]) => Promise<void>) {
  const indexes: IndexDescription[] = [{ name: '_id_', key: { _id: 1 }, unique: true }];
  const listIndexes = vi.fn(() => ({ toArray: async () => [...indexes] }));
  const collection = {
    find: () => ({ async *[Symbol.asyncIterator]() {} }),
    listIndexes,
    createIndex: vi.fn(async (key: Record<string, number>) => {
      await onCreate(key, indexes);
      return Object.keys(key)[0] || '';
    }),
  };
  const database = {
    listCollections: () => ({ hasNext: async () => true }),
    collection: () => collection,
  };
  return {
    indexes,
    listIndexes,
    collection,
    migrate: () => migrateCheckoutIndexes(database as unknown as Db, 'checkoutIdempotencies'),
  };
}

function addCompatibleIndex(key: Record<string, number>, indexes: IndexDescription[]): void {
  const field = Object.keys(key)[0];
  indexes.push(field === 'keyHash'
    ? { name: 'checkout_idempotency_key_unique', key: { keyHash: 1 }, unique: true }
    : { name: 'checkout_idempotency_expiry_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 });
}

describe('checkout index migration acknowledgement recovery', () => {
  it('creates and verifies both required indexes from the index catalog', async () => {
    const harness = makeMigrationHarness(async (key, indexes) => addCompatibleIndex(key, indexes));

    await expect(harness.migrate()).resolves.toBeUndefined();

    expect(harness.indexes.some((index) => index.key.keyHash === 1 && index.unique === true)).toBe(true);
    expect(harness.indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
    expect(harness.listIndexes).toHaveBeenCalledTimes(3); // preflight plus post-create verification for each index
  });

  it('accepts a compatible index that exists after createIndex throws', async () => {
    const harness = makeMigrationHarness(async (key, indexes) => {
      addCompatibleIndex(key, indexes);
      throw new Error('acknowledgement lost');
    });

    await expect(harness.migrate()).resolves.toBeUndefined();
  });

  it('reports definite absence when creation throws and catalog inspection succeeds', async () => {
    const harness = makeMigrationHarness(async () => { throw new Error('permission denied'); });

    await expect(harness.migrate()).rejects.toThrow(/definitely absent at inspection time/);
  });

  it('reports an index conflict when an incompatible index appears after a creation error', async () => {
    const harness = makeMigrationHarness(async (key, indexes) => {
      if (Object.hasOwn(key, 'keyHash')) indexes.push({ name: 'non_unique_hash', key: { keyHash: 1 } });
      throw new Error('creation failed');
    });

    await expect(harness.migrate()).rejects.toThrow(/Index conflict: non_unique_hash/);
    expect(harness.indexes.some((index) => index.name === 'non_unique_hash')).toBe(true);
  });

  it('reports UNKNOWN when creation throws and the index catalog cannot be inspected', async () => {
    const harness = makeMigrationHarness(async () => { throw new Error('acknowledgement lost'); });
    harness.listIndexes.mockImplementationOnce(() => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 }, unique: true }] }));
    harness.listIndexes.mockImplementationOnce(() => ({ toArray: async () => { throw new Error('catalog unavailable'); } }));

    await expect(harness.migrate()).rejects.toThrow(/UNKNOWN: Could not inspect the MongoDB index catalog for keyHash/);
  });

  it('reports TTL failure with the unique index retained and checkout still fail-closed', async () => {
    const harness = makeMigrationHarness(async (key, indexes) => {
      if (Object.hasOwn(key, 'keyHash')) addCompatibleIndex(key, indexes);
      else throw new Error('TTL creation denied');
    });

    await expect(harness.migrate()).rejects.toThrow(/unique keyHash index is installed.*expiresAt TTL index is not confirmed/);
    expect(harness.indexes.some((index) => index.key.keyHash === 1 && index.unique === true)).toBe(true);
    expect(harness.indexes.some((index) => index.key.expiresAt === 1)).toBe(false);
  });

  it('reruns safely after partial unique-index creation without replacing it', async () => {
    let rejectTtlOnce = true;
    const harness = makeMigrationHarness(async (key, indexes) => {
      if (Object.hasOwn(key, 'keyHash')) {
        addCompatibleIndex(key, indexes);
        return;
      }
      if (rejectTtlOnce) {
        rejectTtlOnce = false;
        throw new Error('temporary TTL failure');
      }
      addCompatibleIndex(key, indexes);
    });

    await expect(harness.migrate()).rejects.toThrow(/TTL index is not confirmed/);
    await expect(harness.migrate()).resolves.toBeUndefined();

    expect(harness.collection.createIndex).toHaveBeenCalledTimes(3);
    expect(harness.indexes.filter((index) => index.key.keyHash === 1)).toHaveLength(1);
    expect(harness.indexes.filter((index) => index.key.expiresAt === 1)).toHaveLength(1);
  });
});
