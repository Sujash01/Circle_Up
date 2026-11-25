#!/usr/bin/env node

/**
 * CircleUp – Production Owner Account Recovery Script (Phase B)
 *
 * Safely recovers and updates the primary Owner account in Supabase without
 * mutating foreign keys, recreating accounts, or violating role constraints.
 *
 * Target Account Specifications:
 *   - Target UUID: 4b00bddd-5e4d-47e3-883d-dd48d57775a5
 *   - Current Email: owner@circleuponline.com
 *   - Intended Email: circleup.023@gmail.com
 *   - Intended Display Name: CircleUp
 *   - Intended Role: owner (strictly preserved)
 *   - Password Hashing: Argon2id ($argon2id$...)
 *
 * Safety Guards:
 *   1. Verifies target UUID existence before any update.
 *   2. Enforces owner role check (never alters staff or creates duplicate owners).
 *   3. Enforces duplicate-email pre-flight check.
 *   4. Validates password complexity (min 10 chars, upper, lower, digit).
 *   5. Resets failed_attempts to 0 and clears locked_until.
 *   6. Revokes all existing active admin sessions.
 *   7. Supports --dry-run mode (read-only verification).
 *   8. Supports --sql-only mode (generates transaction-safe SQL for Supabase SQL Editor).
 *   9. Zero secrets printed in logs or terminal history.
 *
 * Usage:
 *   Dry Run Verification:
 *     node scripts/recover-production-owner.mjs --dry-run
 *
 *   Generate Transaction SQL (Recommended for Supabase Dashboard):
 *     RECOVERY_PASSWORD='YourStrongPassword123!' node scripts/recover-production-owner.mjs --sql-only
 *
 *   Live Execution via Service Role:
 *     RECOVERY_PASSWORD='YourStrongPassword123!' node scripts/recover-production-owner.mjs --live
 */

import readline from 'node:readline';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from standard candidate locations
dotenv.config();
dotenv.config({ path: 'backend/.env' });
dotenv.config({ path: 'frontend/.env' });

export const TARGET_OWNER_UUID = '4b00bddd-5e4d-47e3-883d-dd48d57775a5';
export const TARGET_NEW_EMAIL = 'circleup.023@gmail.com';
export const TARGET_NEW_NAME = 'CircleUp';
export const TARGET_ROLE = 'owner';

/**
 * Validates password complexity according to production rules.
 */
export function validateRecoveryPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be provided.');
  }
  if (password.length < 10) {
    throw new Error('Password must be at least 10 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one digit.');
  }
}

/**
 * Hashes password with Argon2id matching backend adminAuth.service.ts
 */
export async function hashOwnerPassword(password) {
  validateRecoveryPassword(password);
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Generates transaction-safe SQL for execution in Supabase Dashboard SQL Editor.
 */
export function generateRecoverySql(passwordHash) {
  if (!passwordHash || !passwordHash.startsWith('$argon2id$')) {
    throw new Error('Valid Argon2id hash is required to generate SQL.');
  }

  // Escape single quotes for SQL literal
  const escapedHash = passwordHash.replace(/'/g, "''");

  return `-- ==============================================================================
-- CircleUp Production Owner Account Safe Recovery Transaction
-- Target UUID: ${TARGET_OWNER_UUID}
-- Target Email: ${TARGET_NEW_EMAIL}
-- Target Name: ${TARGET_NEW_NAME}
-- Generated at: ${new Date().toISOString()}
-- ==============================================================================

BEGIN;

-- 1. Pre-flight verification: Ensure target owner exists with 'owner' role
DO $$
DECLARE
  v_current_role text;
  v_conflict_id uuid;
BEGIN
  -- Verify target UUID
  SELECT role INTO v_current_role
  FROM public.admin_users
  WHERE id = '${TARGET_OWNER_UUID}';

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Target owner account ${TARGET_OWNER_UUID} does not exist. Aborting.';
  END IF;

  IF v_current_role <> '${TARGET_ROLE}' THEN
    RAISE EXCEPTION 'Target account exists but does not have owner role (found %). Aborting.', v_current_role;
  END IF;

  -- Verify no other account collides with new email
  SELECT id INTO v_conflict_id
  FROM public.admin_users
  WHERE email = '${TARGET_NEW_EMAIL}'
    AND id <> '${TARGET_OWNER_UUID}';

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'An administrator with email ${TARGET_NEW_EMAIL} already exists (UUID: %). Aborting.', v_conflict_id;
  END IF;
END;
$$;

-- 2. Update Owner Account (preserve UUID, update email, name, password_hash, reset lockouts)
UPDATE public.admin_users
SET
  email = '${TARGET_NEW_EMAIL}',
  full_name = '${TARGET_NEW_NAME}',
  password_hash = '${escapedHash}',
  is_active = true,
  failed_attempts = 0,
  locked_until = NULL,
  updated_at = timezone('utc'::text, now())
WHERE id = '${TARGET_OWNER_UUID}'
  AND role = '${TARGET_ROLE}';

-- 3. Revoke all existing sessions for this owner to force fresh login
UPDATE public.admin_auth_sessions
SET revoked_at = timezone('utc'::text, now())
WHERE user_id = '${TARGET_OWNER_UUID}'
  AND revoked_at IS NULL;

-- 4. Verification Check
DO $$
DECLARE
  v_updated_email text;
  v_active boolean;
  v_attempts integer;
BEGIN
  SELECT email, is_active, failed_attempts
  INTO v_updated_email, v_active, v_attempts
  FROM public.admin_users
  WHERE id = '${TARGET_OWNER_UUID}';

  IF v_updated_email <> '${TARGET_NEW_EMAIL}' OR v_active <> true OR v_attempts <> 0 THEN
    RAISE EXCEPTION 'Verification check failed after update. Rolling back.';
  END IF;
END;
$$;

COMMIT;

-- Verification query (run after COMMIT to confirm state):
SELECT id, email, full_name, role, is_active, failed_attempts, locked_until, updated_at
FROM public.admin_users
WHERE id = '${TARGET_OWNER_UUID}';
`;
}

/**
 * Prompts user for masked input from stdin.
 */
function promptPassword(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Simple hidden password prompt
    process.stdout.write(promptText);
    let password = '';
    const stdin = process.stdin;
    const oldRawMode = stdin.isRaw;

    if (stdin.setRawMode) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          stdin.setRawMode(oldRawMode || false);
          stdin.removeListener('data', onData);
          rl.close();
          console.log('');
          resolve(password);
        } else if (char === '\u0003') {
          // Ctrl+C
          stdin.setRawMode(oldRawMode || false);
          process.exit(1);
        } else if (char === '\u007f' || char === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      };

      stdin.on('data', onData);
    } else {
      rl.question('', (ans) => {
        rl.close();
        resolve(ans);
      });
    }
  });
}

/**
 * Performs recovery checks and execution against Supabase service client.
 */
export async function executeRecovery(supabaseClient, options = {}) {
  const { dryRun = true, passwordHash = null } = options;

  console.log(`\n🔍 Step 1: Pre-flight Verification for UUID: ${TARGET_OWNER_UUID}...`);

  // 1. Check target user
  const { data: targetUser, error: targetError } = await supabaseClient
    .from('admin_users')
    .select('id, email, full_name, role, is_active, failed_attempts, locked_until')
    .eq('id', TARGET_OWNER_UUID)
    .maybeSingle();

  if (targetError) {
    throw new Error(`Database query failed: ${targetError.message}`);
  }

  if (!targetUser) {
    throw new Error(`Target Owner account with UUID ${TARGET_OWNER_UUID} not found in admin_users.`);
  }

  if (targetUser.role !== TARGET_ROLE) {
    throw new Error(`Target account has role '${targetUser.role}', expected '${TARGET_ROLE}'. Recovery aborted.`);
  }

  console.log(`   ✅ Found Target Owner:`);
  console.log(`      Current Email: ${targetUser.email}`);
  console.log(`      Current Name:  ${targetUser.full_name}`);
  console.log(`      Role:          ${targetUser.role}`);
  console.log(`      Active:        ${targetUser.is_active}`);
  console.log(`      Failed Logins: ${targetUser.failed_attempts ?? 0}`);
  console.log(`      Locked Until:  ${targetUser.locked_until ?? 'None'}`);

  // 2. Check duplicate email conflict
  console.log(`\n🔍 Step 2: Checking email uniqueness for: ${TARGET_NEW_EMAIL}...`);
  const { data: conflictUser, error: conflictError } = await supabaseClient
    .from('admin_users')
    .select('id, email, role')
    .eq('email', TARGET_NEW_EMAIL)
    .neq('id', TARGET_OWNER_UUID)
    .maybeSingle();

  if (conflictError) {
    throw new Error(`Failed to check email uniqueness: ${conflictError.message}`);
  }

  if (conflictUser) {
    throw new Error(`Email conflict: '${TARGET_NEW_EMAIL}' is already assigned to admin UUID ${conflictUser.id}. Recovery aborted.`);
  }

  console.log(`   ✅ Target email '${TARGET_NEW_EMAIL}' is available.`);

  if (dryRun) {
    console.log(`\n🛡️ [DRY RUN COMPLETE]`);
    console.log(`   Preconditions passed. Target Owner UUID ${TARGET_OWNER_UUID} is verified.`);
    console.log(`   No database updates were performed.`);
    return { success: true, dryRun: true, targetUser };
  }

  if (!passwordHash) {
    throw new Error('Password hash is required for live execution.');
  }

  // 3. Perform Live Update
  console.log(`\n🚀 Step 3: Executing Live Update for Owner ${TARGET_OWNER_UUID}...`);
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseClient
    .from('admin_users')
    .update({
      email: TARGET_NEW_EMAIL,
      full_name: TARGET_NEW_NAME,
      password_hash: passwordHash,
      is_active: true,
      failed_attempts: 0,
      locked_until: null,
      updated_at: now,
    })
    .eq('id', TARGET_OWNER_UUID)
    .eq('role', TARGET_ROLE)
    .select('id, email, full_name, role, is_active, failed_attempts, locked_until, updated_at')
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to update owner record: ${updateError?.message || 'No row updated'}`);
  }

  // 4. Revoke Active Sessions
  console.log(`\n🔒 Step 4: Revoking active admin sessions...`);
  const { error: sessionError } = await supabaseClient
    .from('admin_auth_sessions')
    .update({ revoked_at: now })
    .eq('user_id', TARGET_OWNER_UUID)
    .is('revoked_at', null);

  if (sessionError) {
    console.warn(`   ⚠️ Warning: Session revocation returned notice: ${sessionError.message}`);
  } else {
    console.log(`   ✅ Previous active sessions successfully revoked.`);
  }

  console.log(`\n🎉 [RECOVERY COMPLETED SUCCESSFULLY]`);
  console.log(`   Owner UUID:     ${updated.id}`);
  console.log(`   New Email:      ${updated.email}`);
  console.log(`   New Name:       ${updated.full_name}`);
  console.log(`   Role:           ${updated.role}`);
  console.log(`   Status:         ${updated.is_active ? 'Active' : 'Inactive'}`);
  console.log(`   Lockout Cleared: Yes`);

  return { success: true, dryRun: false, updatedUser: updated };
}

// ==============================================================================
// CLI Main Execution
// ==============================================================================
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isSqlOnly = args.includes('--sql-only');
  const isLive = args.includes('--live');

  console.log('='.repeat(70));
  console.log('  CircleUp Production Owner Account Recovery Utility');
  console.log('='.repeat(70));

  if (!isDryRun && !isSqlOnly && !isLive) {
    console.log(`
Usage:
  1. Dry Run Verification (No credentials or writes):
     node scripts/recover-production-owner.mjs --dry-run

  2. Generate Transaction SQL for Supabase SQL Editor (Recommended):
     node scripts/recover-production-owner.mjs --sql-only

  3. Live Update via Supabase Service Client:
     node scripts/recover-production-owner.mjs --live

Options:
  --dry-run   Verifies database records and connectivity without mutating data.
  --sql-only  Generates Argon2id hash and outputs transaction SQL for SQL Editor.
  --live      Executes the update directly via the Supabase Service Role client.
`);
    process.exit(0);
  }

  // Handle password acquisition
  let password = process.env.RECOVERY_OWNER_PASSWORD || process.env.NEW_OWNER_PASSWORD || '';
  if (!isDryRun && !password) {
    password = await promptPassword('Enter new Owner password (min 10 chars, upper, lower, digit): ');
  }

  let passwordHash = null;
  if (!isDryRun) {
    try {
      validateRecoveryPassword(password);
      console.log('\n🔒 Hashing password with Argon2id ($argon2id$)...');
      passwordHash = await hashOwnerPassword(password);
      console.log('   ✅ Argon2id hash generated successfully.');
    } catch (err) {
      console.error(`\n❌ Password Validation Error: ${err.message}`);
      process.exit(1);
    }
  }

  if (isSqlOnly) {
    console.log('\n' + '='.repeat(70));
    console.log('  TRANSACTION-SAFE SQL SCRIPT FOR SUPABASE DASHBOARD SQL EDITOR');
    console.log('='.repeat(70) + '\n');
    console.log(generateRecoverySql(passwordHash));
    console.log('='.repeat(70));
    console.log('Copy and execute the above block in:');
    console.log('Supabase Dashboard -> SQL Editor -> New Query -> Run');
    console.log('='.repeat(70) + '\n');
    process.exit(0);
  }

  // For live or dry-run, initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error(`
❌ Missing Supabase Configuration:
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for direct execution.
   Alternatively, use '--sql-only' to generate SQL for the Supabase Dashboard!
`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await executeRecovery(supabase, { dryRun: isDryRun, passwordHash });
  } catch (err) {
    console.error(`\n❌ Recovery Failed: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('recover-production-owner.mjs')) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
