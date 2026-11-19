import type { Collection, Db, IndexDescription } from 'mongodb';

const KEY_HASH_PATTERN = /^[a-f0-9]{64}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const ORDER_NUMBER_PATTERN = /^ORD-\d{6}-\d{4}$/;

function isSimpleOrUnspecifiedCollation(index: IndexDescription): boolean {
  return !index.collation || index.collation.locale === 'simple';
}

function hasExactKey(index: IndexDescription, field: string, direction: 1): boolean {
  const entries = Object.entries(index.key || {});
  return entries.length === 1 && entries[0]?.[0] === field && entries[0]?.[1] === direction;
}

type RequiredIndex = 'keyHash' | 'expiresAt';

function compatibleRequiredIndex(index: IndexDescription, required: RequiredIndex): boolean {
  if (required === 'keyHash') {
    return hasExactKey(index, 'keyHash', 1) &&
      index.unique === true &&
      index.sparse !== true &&
      !index.partialFilterExpression &&
      isSimpleOrUnspecifiedCollation(index) &&
      index.expireAfterSeconds === undefined;
  }
  return hasExactKey(index, 'expiresAt', 1) &&
    index.expireAfterSeconds === 0 &&
    index.unique !== true &&
    index.sparse !== true &&
    !index.partialFilterExpression &&
    isSimpleOrUnspecifiedCollation(index);
}

function referencesRequiredField(index: IndexDescription, required: RequiredIndex): boolean {
  return Object.keys(index.key || {}).includes(required);
}

async function inspectRequiredIndex(collection: Collection, required: RequiredIndex): Promise<'compatible' | 'absent'> {
  let indexes: IndexDescription[];
  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    throw new Error(`UNKNOWN: Could not inspect the MongoDB index catalog for ${required}; server index state cannot be established. Retry inspection before rerunning: ${error instanceof Error ? error.message : String(error)}`);
  }

  const relevant = indexes.filter((index) => referencesRequiredField(index, required));
  const incompatible = relevant.find((index) => !compatibleRequiredIndex(index, required));
  if (incompatible) {
    throw new Error(`Index conflict: ${incompatible.name} references ${required} with incompatible fields or options. The migration will not drop or replace it.`);
  }
  return relevant.length > 0 ? 'compatible' : 'absent';
}

async function ensureRequiredIndex(
  collection: Collection,
  required: RequiredIndex,
  key: Record<string, 1>,
  options: { unique?: boolean; expireAfterSeconds?: number; name: string },
): Promise<void> {
  let creationError: unknown;
  let creationFailed = false;
  try {
    await collection.createIndex(key, options);
  } catch (error) {
    creationError = error;
    creationFailed = true;
  }

  const state = await inspectRequiredIndex(collection, required);
  if (state === 'compatible') return;

  const cause = creationError instanceof Error ? creationError.message : String(creationError);
  if (creationFailed) {
    throw new Error(`Index ${options.name} was not present in the catalog after creation failed; it is definitely absent at inspection time. Resolve the MongoDB error and rerun: ${cause}`);
  }
  throw new Error(`Index ${options.name} creation returned successfully, but the required compatible index is absent from the MongoDB catalog. Rerun after checking MongoDB state.`);
}

function failForRecord(id: unknown, field: string, expected: string): never {
  throw new Error(`Checkout idempotency record ${String(id)} has invalid ${field}; expected ${expected}. Resolve this record before retrying the migration.`);
}

/** Preflight the complete collection and every relevant index before creating any index. */
export async function migrateCheckoutIndexes(database: Db, collectionName: string): Promise<void> {
  const collectionExists = await database.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
  const collection = database.collection(collectionName);

  if (collectionExists) {
    const hashes = new Set<string>();
    const cursor = collection.find({}, { projection: { keyHash: 1, fingerprint: 1, orderNumber: 1, expiresAt: 1 } });
    for await (const record of cursor) {
      if (typeof record.keyHash !== 'string' || !KEY_HASH_PATTERN.test(record.keyHash)) {
        failForRecord(record._id, 'keyHash', 'a non-empty, lowercase 64-character SHA-256 hex string');
      }
      if (typeof record.fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(record.fingerprint)) {
        failForRecord(record._id, 'fingerprint', 'a non-empty, lowercase 64-character SHA-256 hex string');
      }
      if (typeof record.orderNumber !== 'string' || !ORDER_NUMBER_PATTERN.test(record.orderNumber)) {
        failForRecord(record._id, 'orderNumber', 'ORD-YYMMDD-NNNN');
      }
      if (!(record.expiresAt instanceof Date) || !Number.isFinite(record.expiresAt.getTime())) {
        failForRecord(record._id, 'expiresAt', 'a valid BSON date');
      }
      if (hashes.has(record.keyHash)) {
        failForRecord(record._id, 'keyHash', 'a unique SHA-256 hex string');
      }
      hashes.add(record.keyHash);
    }
  }

  const existingIndexes = collectionExists ? await collection.listIndexes().toArray() : [];
  let hasCompatibleUniqueHash = false;
  let hasCompatibleExpiryTtl = false;

  for (const index of existingIndexes) {
    if (index.name === '_id_' && hasExactKey(index, '_id', 1) && index.unique === true) continue;
    const keys = Object.keys(index.key || {});
    const referencesKeyHash = keys.includes('keyHash');
    const referencesExpiry = keys.includes('expiresAt');
    const isTtlIndex = index.expireAfterSeconds !== undefined;

    if (referencesKeyHash) {
      const compatible = hasExactKey(index, 'keyHash', 1) &&
        index.unique === true &&
        index.sparse !== true &&
        !index.partialFilterExpression &&
        isSimpleOrUnspecifiedCollation(index) &&
        !isTtlIndex;
      if (!compatible) {
        throw new Error(`Existing index ${index.name} references keyHash with incompatible fields or options. Review it; the migration will not replace or drop indexes.`);
      }
      hasCompatibleUniqueHash = true;
      continue;
    }

    if (referencesExpiry) {
      const compatible = hasExactKey(index, 'expiresAt', 1) &&
        index.expireAfterSeconds === 0 &&
        index.unique !== true &&
        index.sparse !== true &&
        !index.partialFilterExpression &&
        isSimpleOrUnspecifiedCollation(index);
      if (!compatible) {
        throw new Error(`Existing index ${index.name} references expiresAt with incompatible fields or options. Review it; the migration will not replace or drop indexes.`);
      }
      hasCompatibleExpiryTtl = true;
      continue;
    }

    if (isTtlIndex) {
      throw new Error(`Existing TTL index ${index.name} can expire checkout idempotency records unexpectedly. Review it before migration.`);
    }
    if (index.unique === true) {
      throw new Error(`Unexpected unique index ${index.name} exists on the checkout idempotency collection. Review it before migration.`);
    }
  }

  // All data and index checks finish before the first index mutation.
  if (!hasCompatibleUniqueHash) {
    await ensureRequiredIndex(collection, 'keyHash', { keyHash: 1 }, { unique: true, name: 'checkout_idempotency_key_unique' });
    hasCompatibleUniqueHash = true;
  }

  if (!hasCompatibleExpiryTtl) {
    try {
      await ensureRequiredIndex(collection, 'expiresAt', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'checkout_idempotency_expiry_ttl' });
    } catch (error) {
      throw new Error(`The unique keyHash index is installed, but the expiresAt TTL index is not confirmed. Checkout remains fail-closed; rerun safely after resolving the TTL index state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
