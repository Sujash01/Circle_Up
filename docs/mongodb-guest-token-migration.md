# CircleUp – MongoDB Guest Token SHA-256 Migration Guide

## 1. Executive Summary & Objective

This document outlines the migration procedure for transitioning all CircleUp guest order access tokens stored in MongoDB from plaintext to cryptographic SHA-256 hex digests.

### Security Objective
- **Current State**: New orders created after the security hardening store only a SHA-256 hash in `guestAccessTokenHash` and `guestAccessToken`. Raw tokens are returned to the user exactly once at creation and never persisted.
- **Legacy State**: Historical orders created prior to November 15, 2026 may contain raw plaintext access tokens in the `guestAccessToken` field with `guestAccessTokenHash: null`.
- **Target State**: 100% of guest order documents possess a valid 64-character hex SHA-256 hash in both `guestAccessTokenHash` and `guestAccessToken`. Plaintext token values are completely eliminated from storage.

---

## 2. Token Lifecycle & Dual-Path Verification

### Order Creation (New Orders)
As implemented in `backend/src/modules/orders/order.service.ts` (lines 290–318):
1. A 32-byte cryptographic random token is generated via `crypto.randomBytes(32).toString('hex')`.
2. The raw token is immediately hashed via `hashGuestToken(token)`.
3. The database receives:
   ```json
   {
     "guestAccessToken": "<sha256_hex_hash>",
     "guestAccessTokenHash": "<sha256_hex_hash>",
     "guestAccessExpiresAt": "<ISODate +30 days>"
   }
   ```
4. The raw token is attached to the HTTP response payload (`res.data.guestAccessToken = rawToken`) and sent to the client once. It is never stored.

### Dual-Path Verification (Active Backward Compatibility)
As implemented in `order.service.ts` (lines 34–68):
1. **Primary path**: Hashes the customer's provided token and compares it to `order.guestAccessTokenHash` using `crypto.timingSafeEqual()`.
2. **Backward-compatibility path**: Compares the customer's provided token directly to `order.guestAccessToken` using `crypto.timingSafeEqual()`.
> **CRITICAL RULE**: The backward-compatibility path at `order.service.ts:55-62` remains **ACTIVE** and will NOT be removed until this migration is executed, verified, and confirmed in production.

---

## 3. Migration Script Implementation (`scripts/migrateGuestTokens.mjs`)

The migration script supports three execution modes:
- `--dry-run`: Read-only audit without writing to the database.
- `--verify`: Integrity check verifying that all records have valid SHA-256 hashes.
- Default (no flag): Batch migration using conditional atomic updates.

### Safety Guarantees
1. **Idempotency**: The query filter selects `{ guestAccessToken: { $ne: null }, guestAccessTokenHash: null }`. Running the script multiple times is safe and skips already-migrated records.
2. **Conditional Updates**: Updates use `updateOne({ _id: doc._id, guestAccessTokenHash: null }, { $set: ... })`. If a concurrent process or prior run set the hash, the update is safely ignored (`modifiedCount === 0`).
3. **No Overwrites**: Existing valid hashes are never overwritten.
4. **Batch Processing**: Configurable via `MIGRATION_BATCH_SIZE` (default: 100). Re-queries on each iteration to prevent cursor starvation and allow seamless resumption if interrupted.
5. **No Data Deletion**: The legacy field `guestAccessToken` is updated with the hash (not deleted), ensuring legacy schema consumers do not break.
6. **No Token Leakage**: The script logs order numbers only; raw tokens or hash values are never printed to stdout/stderr.

---

## 4. Pre-Migration Checklist & Backup

Before executing any database commands:
1. Ensure access to MongoDB with write privileges on the `orders` collection.
2. Create a timestamped collection backup using `mongodump`:
   ```bash
   mongodump --uri="$MONGODB_URI" --collection=orders --out="./backup-orders-$(date +%Y%m%d_%H%M%S)"
   ```
3. Verify that the backup directory contains `orders.bson` and `orders.metadata.json`:
   ```bash
   ls -lh ./backup-orders-*/<database_name>/
   ```
4. Confirm application traffic is either low or standard (the script runs concurrently without blocking database locks).

---

## 5. Execution Procedure

### Step 1: Run Dry-Run (Read-Only Audit)
Execute against the target database:
```bash
node scripts/migrateGuestTokens.mjs --dry-run
```
**Expected Output Example**:
```
═══════════════════════════════════════════════════
  CircleUp Guest Token Migration  [DRY-RUN]
═══════════════════════════════════════════════════
  Timestamp:  2026-11-15T22:30:00.000Z
  Batch size: 100

🔌 Connecting to MongoDB...
✅ Connected.

📊 DRY-RUN: Read-only audit of guest order tokens

  ┌────────────────────────────────────────────────
  │ Total guest orders:               142
  │ Already migrated (have hash):     42
  │ Eligible for migration:           100
  │ ├── Plaintext tokens (sampled):   100
  │ Invalid/empty token records:      0
  │ Authenticated orders (no token):  310
  └────────────────────────────────────────────────

⚠️  100 orders require migration.
   Run without --dry-run to execute the migration.

🔌 Disconnected from MongoDB.
```

### Step 2: Execute Migration (MANUAL EXECUTION ONLY)
> [!IMPORTANT]
> This command modifies database records. Execute only after human review and backup verification.

```bash
# PRODUCTION EXECUTION (MANUAL ONLY)
node scripts/migrateGuestTokens.mjs
```
To run with a custom batch size:
```bash
MIGRATION_BATCH_SIZE=250 node scripts/migrateGuestTokens.mjs
```

### Step 3: Run Verification
Immediately verify that 100% of guest order tokens possess valid hashes:
```bash
node scripts/migrateGuestTokens.mjs --verify
```
**Passing Output**:
```
═══════════════════════════════════════════════════
  CircleUp Guest Token Migration  [VERIFY]
═══════════════════════════════════════════════════

🔍 VERIFY: Post-migration integrity check

  ┌────────────────────────────────────────────────
  │ Records with guestAccessTokenHash: 142
  │ ├── Valid SHA-256 hashes:           142
  │ └── Invalid hashes:                 0
  │ Remaining unhashed records:         0
  │ Plaintext divergence (legacy≠hash): 0
  └────────────────────────────────────────────────

✅ PASS: All guest order tokens are properly hashed.
✅ PASS: No plaintext token divergence detected.
   The legacy backward-compatibility verification path can now be safely removed.
```

---

## 6. Recovery & Rollback Strategy

### Partial Interruption Recovery
If the migration process terminates abruptly (network glitch, SIGINT, timeout):
- No data is corrupted.
- Any completed batch remains safely hashed.
- Re-run `node scripts/migrateGuestTokens.mjs`. The script will pick up precisely where it left off, querying only orders where `guestAccessTokenHash: null`.

### Full Collection Rollback & Restoration
If an unexpected issue arises, the pre-migration `mongodump` backup provides full recovery:
```bash
# Standard restore (drops current orders and restores pre-migration state)
mongorestore --uri="$MONGODB_URI" --collection=orders --db=<database_name> --drop ./backup-orders-<timestamp>/<database_name>/orders.bson
```
> [!CAUTION]
> **Rollback Limitations**: Using `--drop` replaces the collection with the pre-migration state. Any new orders placed by shoppers between the backup timestamp and the restore operation would be lost. 
> 
> **Zero-Loss Alternative**: If live orders were created during the migration window, restore the backup into a temporary collection:
> ```bash
> mongorestore --uri="$MONGODB_URI" --collection=orders_backup --db=<database_name> ./backup-orders-<timestamp>/<database_name>/orders.bson
> ```
> Then selectively revert only affected legacy orders using a script, leaving new orders intact.

---

## 7. Post-Migration Cleanup (Future Task)

Once:
1. `node scripts/migrateGuestTokens.mjs --verify` exits with code 0 in production, and
2. Guest order lookup metrics show zero legacy plaintext lookups over 7 days,

The legacy fallback in `backend/src/modules/orders/order.service.ts` (lines 55–62) can be scheduled for deletion in a separate maintenance release.
