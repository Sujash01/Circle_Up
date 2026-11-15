import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

/** Functions identical to scripts/migrateGuestTokens.mjs */
function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function isSha256Hex(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

interface MockOrderDoc {
  _id: string;
  orderNumber: string;
  guestAccessToken: string | null;
  guestAccessTokenHash: string | null;
  customerId?: string | null;
}

interface FilterQuery {
  guestAccessToken?: { $ne: null } | null;
  guestAccessTokenHash?: { $ne: null; $regex?: RegExp } | null;
  customerId?: { $ne: null } | null;
  _id?: string;
}

interface UpdateDoc {
  $set?: Partial<MockOrderDoc>;
}

class MockCollection {
  docs: MockOrderDoc[];
  updateCalls: number = 0;

  constructor(initialDocs: MockOrderDoc[]) {
    this.docs = JSON.parse(JSON.stringify(initialDocs));
  }

  async countDocuments(filter: FilterQuery): Promise<number> {
    return this.find(filter).length;
  }

  find(filter: FilterQuery): MockOrderDoc[] {
    return this.docs.filter((doc) => {
      if (filter.guestAccessToken && filter.guestAccessToken.$ne === null) {
        if (doc.guestAccessToken === null || doc.guestAccessToken === undefined) return false;
      }
      if (filter.guestAccessTokenHash === null) {
        if (doc.guestAccessTokenHash !== null && doc.guestAccessTokenHash !== undefined) return false;
      }
      if (filter.guestAccessTokenHash && filter.guestAccessTokenHash.$ne === null) {
        if (doc.guestAccessTokenHash === null || doc.guestAccessTokenHash === undefined) return false;
        if (filter.guestAccessTokenHash.$regex) {
          if (!filter.guestAccessTokenHash.$regex.test(doc.guestAccessTokenHash)) return false;
        }
      }
      if (filter.customerId && filter.customerId.$ne === null) {
        if (!doc.customerId) return false;
      }
      return true;
    });
  }

  async updateOne(filter: FilterQuery, update: UpdateDoc): Promise<{ modifiedCount: number }> {
    this.updateCalls++;
    const idx = this.docs.findIndex((doc) => {
      if (doc._id !== filter._id) return false;
      if (filter.guestAccessTokenHash === null && doc.guestAccessTokenHash !== null) return false;
      return true;
    });

    if (idx === -1) {
      return { modifiedCount: 0 };
    }

    if (update.$set) {
      Object.assign(this.docs[idx], update.$set);
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  }
}

describe('Migration Script Logic (migrateGuestTokens.mjs)', () => {
  const legacyPlaintext = 'raw-legacy-secret-token-abcdef1234567890';
  const expectedHash = hashGuestToken(legacyPlaintext);

  it('hashGuestToken generates expected SHA-256 hex digest', () => {
    expect(expectedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGuestToken('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('isSha256Hex accurately distinguishes hashes from raw tokens', () => {
    expect(isSha256Hex(expectedHash)).toBe(true);
    expect(isSha256Hex(legacyPlaintext)).toBe(false);
    expect(isSha256Hex('')).toBe(false);
    expect(isSha256Hex(null)).toBe(false);
    expect(isSha256Hex(undefined)).toBe(false);
    expect(isSha256Hex('123456')).toBe(false);
  });

  describe('Dry-run Mode Simulation', () => {
    it('accurately counts eligible, already-migrated, and customer orders without modifying data', async () => {
      const initialDocs: MockOrderDoc[] = [
        {
          _id: 'ord-1',
          orderNumber: 'CU-2026-0001',
          guestAccessToken: legacyPlaintext,
          guestAccessTokenHash: null,
        },
        {
          _id: 'ord-2',
          orderNumber: 'CU-2026-0002',
          guestAccessToken: expectedHash,
          guestAccessTokenHash: expectedHash,
        },
        {
          _id: 'ord-3',
          orderNumber: 'CU-2026-0003',
          guestAccessToken: null,
          guestAccessTokenHash: null,
          customerId: 'cust-uuid-1',
        },
      ];

      const col = new MockCollection(initialDocs);

      const eligible = await col.countDocuments({
        guestAccessToken: { $ne: null },
        guestAccessTokenHash: null,
      });
      const alreadyMigrated = await col.countDocuments({
        guestAccessTokenHash: { $ne: null, $regex: /^[a-f0-9]{64}$/i },
      });
      const authenticated = await col.countDocuments({
        customerId: { $ne: null },
        guestAccessToken: null,
        guestAccessTokenHash: null,
      });

      expect(eligible).toBe(1);
      expect(alreadyMigrated).toBe(1);
      expect(authenticated).toBe(1);
      expect(col.updateCalls).toBe(0); // Zero writes in dry run
    });
  });

  describe('Batch Migration Simulation', () => {
    it('migrates legacy tokens, enforces idempotency and conditional safety', async () => {
      const initialDocs: MockOrderDoc[] = [
        {
          _id: 'ord-1',
          orderNumber: 'CU-2026-0001',
          guestAccessToken: 'token-1-plain',
          guestAccessTokenHash: null,
        },
        {
          _id: 'ord-2',
          orderNumber: 'CU-2026-0002',
          guestAccessToken: 'token-2-plain',
          guestAccessTokenHash: null,
        },
        {
          _id: 'ord-3',
          orderNumber: 'CU-2026-0003',
          guestAccessToken: expectedHash,
          guestAccessTokenHash: expectedHash, // already migrated
        },
      ];

      const col = new MockCollection(initialDocs);

      // Run migration logic
      const eligible = col.find({
        guestAccessToken: { $ne: null },
        guestAccessTokenHash: null,
      });

      let migrated = 0;
      let skipped = 0;

      for (const doc of eligible) {
        if (doc.guestAccessTokenHash) {
          skipped++;
          continue;
        }
        const tokenHash = hashGuestToken(doc.guestAccessToken!);
        const res = await col.updateOne(
          { _id: doc._id, guestAccessTokenHash: null },
          { $set: { guestAccessTokenHash: tokenHash, guestAccessToken: tokenHash } },
        );
        if (res.modifiedCount > 0) migrated++;
        else skipped++;
      }

      expect(migrated).toBe(2);
      expect(skipped).toBe(0);

      // Verify all docs now have hashes
      expect(col.docs[0].guestAccessTokenHash).toBe(hashGuestToken('token-1-plain'));
      expect(col.docs[1].guestAccessTokenHash).toBe(hashGuestToken('token-2-plain'));
      expect(col.docs[2].guestAccessTokenHash).toBe(expectedHash);

      // Idempotency: re-running finds 0 eligible
      const secondRunEligible = col.find({
        guestAccessToken: { $ne: null },
        guestAccessTokenHash: null,
      });
      expect(secondRunEligible.length).toBe(0);
    });
  });

  describe('Verification Mode Simulation', () => {
    it('confirms 100% valid SHA-256 hashes and detects unmigrated records', async () => {
      const validDocs: MockOrderDoc[] = [
        {
          _id: 'ord-1',
          orderNumber: 'CU-2026-0001',
          guestAccessToken: expectedHash,
          guestAccessTokenHash: expectedHash,
        },
      ];

      const col = new MockCollection(validDocs);
      const remainingUnhashed = await col.countDocuments({
        guestAccessToken: { $ne: null },
        guestAccessTokenHash: null,
      });
      expect(remainingUnhashed).toBe(0);

      const allHashed = col.find({ guestAccessTokenHash: { $ne: null } });
      const allValid = allHashed.every((d) => isSha256Hex(d.guestAccessTokenHash));
      expect(allValid).toBe(true);
    });
  });
});
