/**
 * Real PostgreSQL & Supabase Integration Verification Test Suite
 * Milestone 1, Step 3: Real Database Integration Verification
 *
 * Runs strictly against a disposable local PostgreSQL 16 container.
 * Zero connection to production Supabase.
 */

import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CONTAINER_NAME = 'circleup_real_pg_test';
const PG_PORT = 54323;
const DB_NAME = 'circleup_test_db';
const DB_USER = 'postgres';
const DB_PASS = 'postgres';

function log(msg) {
  console.log(`[REAL-PG-TEST] ${msg}`);
}

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    throw new Error(`Command failed: ${cmd}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
  }
}

function runSql(sql, role = 'postgres') {
  const rolePrefix = role === 'postgres' ? '' : `SET ROLE ${role};`;
  const fullSql = `${rolePrefix}\n${sql}`;
  const res = execSync(`docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -v ON_ERROR_STOP=1 -t -A`, {
    input: fullSql,
    encoding: 'utf8',
  });
  return res.trim();
}

function queryJson(sql, role = 'postgres') {
  const cleanSql = sql.trim().replace(/;$/, '');
  const wrapped = `SELECT to_jsonb(val) FROM (${cleanSql}) as _q(val);`;
  const res = runSql(wrapped, role);
  return JSON.parse(res);
}

async function startContainer() {
  log('Ensuring Docker Desktop is running...');
  try {
    execSync('docker ps', { stdio: 'ignore' });
  } catch {
    log('Starting Docker Desktop...');
    execSync('Start-Process -FilePath "C:\\Users\\Zorawar\\AppData\\Local\\Programs\\DockerDesktop\\Docker Desktop.exe"', {
      shell: 'powershell',
      stdio: 'ignore',
    });
    let running = false;
    for (let i = 0; i < 30; i++) {
      try {
        execSync('docker ps', { stdio: 'ignore' });
        running = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!running) throw new Error('Docker Desktop failed to start.');
  }

  log(`Cleaning up any existing test container (${CONTAINER_NAME})...`);
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch {}

  log(`Starting disposable PostgreSQL 16 container on port ${PG_PORT}...`);
  runCmd(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=${DB_PASS} -e POSTGRES_DB=${DB_NAME} -p ${PG_PORT}:5432 postgres:16`);

  log('Waiting for PostgreSQL to accept connections...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER} -d ${DB_NAME}`, { stdio: 'ignore' });
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!ready) throw new Error('Disposable PostgreSQL container failed to become ready.');
  log('PostgreSQL 16 container is ready!');
}

function stopContainer() {
  log(`Tearing down disposable container (${CONTAINER_NAME})...`);
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
    log('Container cleaned up successfully.');
  } catch (err) {
    console.error('Failed to cleanup container:', err.message);
  }
}

function applyMigrations() {
  log('Setting up Supabase emulation schema & roles...');
  const preludeSql = `
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      email_confirmed_at timestamptz DEFAULT now(),
      confirmed_at timestamptz DEFAULT now(),
      raw_user_meta_data jsonb,
      raw_app_meta_data jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    $$ LANGUAGE sql STABLE;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END $$;
  `;
  runSql(preludeSql);

  const migrations = [
    'supabase/migrations/20261115_create_products_schema.sql',
    'supabase/migrations/20261115_create_profiles.sql',
    'supabase/migrations/20261115_fix_rls_policies.sql',
    'supabase/migrations/20261115_remove_auto_confirm.sql',
    'supabase/migrations/20261117_inventory_design_schema.sql',
    'supabase/migrations/20261120_admin_crm_full_schema.sql',
    'supabase/migrations/20261121_checkout_infrastructure.sql',
    'supabase/migrations/20261122_checkout_atomic_rpc.sql',
  ];

  for (const mig of migrations) {
    log(`Applying migration: ${mig}...`);
    const sql = fs.readFileSync(path.resolve(mig), 'utf8');
    runSql(sql);
    log(`Applied: ${mig}`);
  }
}

function seedTestData() {
  log('Seeding initial test catalog, coupons, and site settings...');
  const seedSql = `
    -- Default Site Settings with WhatsApp Disabled
    INSERT INTO public.site_settings (id, whatsapp_number, is_whatsapp_verified)
    VALUES ('default', '919820112233', false)
    ON CONFLICT (id) DO UPDATE SET whatsapp_number = '919820112233', is_whatsapp_verified = false;

    -- Test Products
    -- 1. Standard Product (Stock: 5, Price: 100000 paise / ₹1,000)
    INSERT INTO public.products (id, serial_number, name, slug, category, price, stock, sizes, status)
    VALUES (
      '11111111-1111-1111-1111-111111111111',
      'TEST-PROD-001',
      'Vintage Indigo Worker Jacket',
      'vintage-indigo-worker-jacket',
      'womens-upperwear',
      100000,
      5,
      ARRAY['S', 'M', 'L'],
      'PUBLISHED'
    ) ON CONFLICT (serial_number) DO UPDATE SET stock = 5, price = 100000, status = 'PUBLISHED';

    -- 2. Single-Stock Product (Stock: 1, Price: 250000 paise / ₹2,500)
    INSERT INTO public.products (id, serial_number, name, slug, category, price, stock, sizes, status)
    VALUES (
      '22222222-2222-2222-2222-222222222222',
      'TEST-PROD-002',
      'Archive Silk Scarf',
      'archive-silk-scarf',
      'accessories',
      250000,
      1,
      ARRAY['ONE_SIZE'],
      'PUBLISHED'
    ) ON CONFLICT (serial_number) DO UPDATE SET stock = 1, price = 250000, status = 'PUBLISHED';

    -- 3. Inactive/Archived Product (Stock: 10, Price: 50000 paise / ₹500)
    INSERT INTO public.products (id, serial_number, name, slug, category, price, stock, sizes, status)
    VALUES (
      '33333333-3333-3333-3333-333333333333',
      'TEST-PROD-INACTIVE',
      'Archived Denim Vest',
      'archived-denim-vest',
      'mens-outerwear',
      50000,
      10,
      ARRAY['M'],
      'ARCHIVED'
    ) ON CONFLICT (serial_number) DO UPDATE SET status = 'ARCHIVED';

    -- Test Coupons
    -- 1. Percentage coupon: 10% off, max discount ₹200 (20000 paise), min order ₹500 (50000 paise)
    INSERT INTO public.coupons (
      id, code, discount_type, discount_value, max_discount_paise, min_order_paise, usage_limit, usage_count, is_active
    ) VALUES (
      '44444444-4444-4444-4444-444444444444',
      'SAVE10',
      'PERCENTAGE',
      10,
      20000,
      50000,
      100,
      0,
      true
    ) ON CONFLICT (code) DO UPDATE SET usage_count = 0, is_active = true;

    -- 2. Flat coupon: ₹150 off (15000 paise), min order ₹500 (50000 paise)
    INSERT INTO public.coupons (
      id, code, discount_type, discount_value, min_order_paise, usage_limit, usage_count, is_active
    ) VALUES (
      '55555555-5555-5555-5555-555555555555',
      'FLAT150',
      'FLAT',
      15000,
      50000,
      100,
      0,
      true
    ) ON CONFLICT (code) DO UPDATE SET usage_count = 0, is_active = true;

    -- 3. Expired coupon
    INSERT INTO public.coupons (
      id, code, discount_type, discount_value, min_order_paise, usage_limit, usage_count, is_active, ends_at
    ) VALUES (
      '66666666-6666-6666-6666-666666666666',
      'EXPIRED',
      'PERCENTAGE',
      15,
      0,
      100,
      0,
      true,
      now() - interval '1 day'
    ) ON CONFLICT (code) DO UPDATE SET ends_at = now() - interval '1 day';

    -- 4. Exhausted coupon (usage_limit = 1, usage_count = 1)
    INSERT INTO public.coupons (
      id, code, discount_type, discount_value, min_order_paise, usage_limit, usage_count, is_active
    ) VALUES (
      '77777777-7777-7777-7777-777777777777',
      'EXHAUSTED',
      'FLAT',
      10000,
      0,
      1,
      1,
      true
    ) ON CONFLICT (code) DO UPDATE SET usage_limit = 1, usage_count = 1;
  `;
  runSql(seedSql);
  log('Test catalog and coupons seeded.');
}

function callRpc(params, role = 'postgres') {
  let keyHash = params.p_key_hash;
  if (keyHash && !/^[a-fA-F0-9]{64}$/.test(keyHash)) {
    keyHash = crypto.createHash('sha256').update(keyHash).digest('hex');
  }
  const p_key_hash = keyHash ? `'${keyHash}'` : 'NULL';

  let fingerprint = params.p_fingerprint;
  if (fingerprint && !/^[a-fA-F0-9]{64}$/.test(fingerprint)) {
    fingerprint = crypto.createHash('sha256').update(fingerprint).digest('hex');
  }
  const p_fingerprint = fingerprint ? `'${fingerprint}'` : 'NULL';
  const p_customer_id = params.p_customer_id ? `'${params.p_customer_id}'` : 'NULL';
  const p_customer = `'${JSON.stringify(params.p_customer).replace(/'/g, "''")}'::jsonb`;
  const p_shipping_address = `'${JSON.stringify(params.p_shipping_address).replace(/'/g, "''")}'::jsonb`;
  const p_items = `'${JSON.stringify(params.p_items).replace(/'/g, "''")}'::jsonb`;
  const p_payment_method = `'${params.p_payment_method}'`;
  const p_promo_code = params.p_promo_code ? `'${params.p_promo_code}'` : 'NULL';
  const p_notes = params.p_notes ? `'${params.p_notes.replace(/'/g, "''")}'` : 'NULL';
  const p_guest_hash = params.p_guest_access_token_hash ? `'${params.p_guest_access_token_hash}'` : 'NULL';
  const p_guest_expires = params.p_guest_access_expires_at ? `'${params.p_guest_access_expires_at}'::timestamptz` : 'NULL';
  const p_order_number = params.p_order_number ? `'${params.p_order_number}'` : 'NULL';

  const rpcCall = `
    SELECT public.process_storefront_checkout(
      ${p_key_hash},
      ${p_fingerprint},
      ${p_customer_id},
      ${p_customer},
      ${p_shipping_address},
      ${p_items},
      ${p_payment_method},
      ${p_promo_code},
      ${p_notes},
      ${p_guest_hash},
      ${p_guest_expires},
      ${p_order_number}
    );
  `;
  const res = runSql(rpcCall, role);
  return JSON.parse(res);
}

function callRpcAsync(params, role = 'postgres') {
  return new Promise((resolve, reject) => {
    let keyHash = params.p_key_hash;
    if (keyHash && !/^[a-fA-F0-9]{64}$/.test(keyHash)) {
      keyHash = crypto.createHash('sha256').update(keyHash).digest('hex');
    }
    const p_key_hash = keyHash ? `'${keyHash}'` : 'NULL';

    let fingerprint = params.p_fingerprint;
    if (fingerprint && !/^[a-fA-F0-9]{64}$/.test(fingerprint)) {
      fingerprint = crypto.createHash('sha256').update(fingerprint).digest('hex');
    }
    const p_fingerprint = fingerprint ? `'${fingerprint}'` : 'NULL';

    const p_customer_id = params.p_customer_id ? `'${params.p_customer_id}'` : 'NULL';
    const p_customer = `'${JSON.stringify(params.p_customer).replace(/'/g, "''")}'::jsonb`;
    const p_shipping_address = `'${JSON.stringify(params.p_shipping_address).replace(/'/g, "''")}'::jsonb`;
    const p_items = `'${JSON.stringify(params.p_items).replace(/'/g, "''")}'::jsonb`;
    const p_payment_method = `'${params.p_payment_method}'`;
    const p_promo_code = params.p_promo_code ? `'${params.p_promo_code}'` : 'NULL';
    const p_notes = params.p_notes ? `'${params.p_notes.replace(/'/g, "''")}'` : 'NULL';
    const p_guest_hash = params.p_guest_access_token_hash ? `'${params.p_guest_access_token_hash}'` : 'NULL';
    const p_guest_expires = params.p_guest_access_expires_at ? `'${params.p_guest_access_expires_at}'::timestamptz` : 'NULL';
    const p_order_number = params.p_order_number ? `'${params.p_order_number}'` : 'NULL';

    const sql = `SELECT public.process_storefront_checkout(${p_key_hash}, ${p_fingerprint}, ${p_customer_id}, ${p_customer}, ${p_shipping_address}, ${p_items}, ${p_payment_method}, ${p_promo_code}, ${p_notes}, ${p_guest_hash}, ${p_guest_expires}, ${p_order_number});`;

    const child = spawn('docker', ['exec', '-i', CONTAINER_NAME, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve({ success: true, data: JSON.parse(stdout.trim()) });
        } catch (e) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      } else {
        resolve({ success: false, error: stderr.trim() });
      }
    });

    child.stdin.write(sql);
    child.stdin.end();
  });
}

function callCleanupAsync() {
  return new Promise((resolve) => {
    const child = spawn('docker', ['exec', '-i', CONTAINER_NAME, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, count: parseInt(stdout.trim(), 10) || 0 });
      } else {
        resolve({ success: false, error: stderr.trim() });
      }
    });

    child.stdin.write('SELECT public.cleanup_expired_idempotency_keys();\n');
    child.stdin.end();
  });
}

function createTransactionBarrier(keyHash) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', CONTAINER_NAME, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let isReady = false;

    child.stdout.on('data', (d) => {
      stdout += d.toString();
      if (!isReady && stdout.includes('BARRIER_LOCKED')) {
        isReady = true;
        resolve({
          release: () => {
            return new Promise((res) => {
              child.on('close', () => res());
              child.stdin.write('COMMIT;\n\\q\n');
              child.stdin.end();
            });
          },
          rollback: () => {
            return new Promise((res) => {
              child.on('close', () => res());
              child.stdin.write('ROLLBACK;\n\\q\n');
              child.stdin.end();
            });
          },
        });
      }
    });

    child.stderr.on('data', (d) => {
      if (!isReady) reject(new Error(`Barrier error: ${d.toString()}`));
    });

    const setupSql = `
      BEGIN;
      SELECT id FROM public.checkout_idempotency WHERE key_hash = '${keyHash}' FOR UPDATE;
      SELECT 'BARRIER_LOCKED';
    `;
    child.stdin.write(setupSql + '\n');
  });
}

// ==============================================================================
// TEST SUITE
// ==============================================================================
let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedCount++;
    throw new Error(`Test assertion failed: ${testName}`);
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('🚀 RUNNING REAL POSTGRESQL CHECKOUT INTEGRATION TESTS');
  console.log('============================================================\n');

  // Standard test payload base
  const baseCustomer = { name: 'Rohan Joshi', email: 'rohan@example.com', phone: '+919876543210' };
  const baseAddress = { addressLine: '42 Hill Road', city: 'Mumbai', state: 'MH', postalCode: '400050' };

  // --------------------------------------------------------------------------
  // TEST 1: Successful COD Checkout & DB Record Verification
  // --------------------------------------------------------------------------
  {
    log('Running Test 1: Successful COD Checkout...');
    const keyHash = crypto.createHash('sha256').update('real-test-cod-1').digest('hex');
    const fingerprint = crypto.createHash('sha256').update('fp-cod-1').digest('hex');
    const guestToken = crypto.randomBytes(32).toString('hex');
    const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
    const guestExpires = new Date(Date.now() + 86400000).toISOString();

    const result = callRpc({
      p_key_hash: keyHash,
      p_fingerprint: fingerprint,
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
      p_promo_code: null,
      p_notes: 'Ring the doorbell',
      p_guest_access_token_hash: guestHash,
      p_guest_access_expires_at: guestExpires,
    });

    assert(result.status === 'CONFIRMED', '1.1 Return status is CONFIRMED');
    assert(result.paymentMethod === 'CASH_ON_DELIVERY', '1.2 Return paymentMethod is CASH_ON_DELIVERY');
    assert(result.paymentStatus === 'PENDING', '1.3 Return paymentStatus is PENDING');
    assert(result.subtotal === 100000, '1.4 Subtotal matches item price (100000 paise)');
    assert(result.deliveryFee === 9000, '1.5 Standard delivery fee applied (9000 paise)');
    assert(result.totalAmount === 109000, '1.6 Total amount is 109000 paise');
    assert(result.guestAccessToken === null, '1.7 Result guestAccessToken is NULL (never returned in DB payload)');

    // Verify actual DB records
    const orderInDb = queryJson(`SELECT row_to_json(o) FROM public.orders o WHERE id = '${result.id}'`);
    assert(orderInDb.order_number === result.orderNumber, '1.8 Order record in orders table matches orderNumber');
    assert(orderInDb.total_amount === 109000, '1.9 DB total_amount matches integer paise');
    assert(orderInDb.guest_access_token_hash === guestHash, '1.10 DB stores exact guest_access_token_hash');
    assert(orderInDb.notes === 'Ring the doorbell', '1.11 DB stores notes');

    // Verify order_items
    const itemsInDb = queryJson(`SELECT json_agg(i) FROM public.order_items i WHERE order_id = '${result.id}'`);
    assert(itemsInDb.length === 1, '1.12 order_items contains 1 row');
    assert(itemsInDb[0].serial_number === 'TEST-PROD-001', '1.13 order_items serial_number matches');
    assert(itemsInDb[0].price === 100000, '1.14 order_items price is 100000 paise');
    assert(itemsInDb[0].quantity === 1, '1.15 order_items quantity is 1');

    // Verify product stock decremented from 5 to 4
    const prodInDb = queryJson(`SELECT row_to_json(p) FROM public.products p WHERE serial_number = 'TEST-PROD-001'`);
    assert(prodInDb.stock === 4, '1.16 Product stock decremented from 5 to 4');
  }

  // --------------------------------------------------------------------------
  // TEST 2: WhatsApp / UPI Checkout Gating & Activation
  // --------------------------------------------------------------------------
  {
    log('Running Test 2: WhatsApp / UPI Checkout Gating & Activation...');
    const keyHash = crypto.createHash('sha256').update('real-test-wa-1').digest('hex');
    const fingerprint = crypto.createHash('sha256').update('fp-wa-1').digest('hex');

    // Currently site_settings has is_whatsapp_verified = false
    let threw = false;
    try {
      callRpc({
        p_key_hash: keyHash,
        p_fingerprint: fingerprint,
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'WHATSAPP_UPI',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('PAYMENT_METHOD_UNAVAILABLE'), '2.1 Rejects WHATSAPP_UPI when is_whatsapp_verified is false');
    }
    assert(threw, '2.2 Rejected unverified WhatsApp checkout');

    // Now enable WhatsApp in site_settings
    runSql(`UPDATE public.site_settings SET whatsapp_number = '919820112233', is_whatsapp_verified = true WHERE id = 'default';`);

    const resultWa = callRpc({
      p_key_hash: keyHash,
      p_fingerprint: fingerprint,
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'WHATSAPP_UPI',
    });
    assert(resultWa.status === 'CONFIRMED', '2.3 Succeeds when is_whatsapp_verified is true');
    assert(resultWa.paymentMethod === 'WHATSAPP_UPI', '2.4 paymentMethod is WHATSAPP_UPI');

    // Reset back to unverified
    runSql(`UPDATE public.site_settings SET is_whatsapp_verified = false WHERE id = 'default';`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: ONLINE_UPI / Razorpay Rejection While Disabled
  // --------------------------------------------------------------------------
  {
    log('Running Test 3: ONLINE_UPI Rejection...');
    let threw = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-online-1').digest('hex'),
        p_fingerprint: 'fp-online-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'ONLINE_UPI',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('PAYMENT_PROVIDER_UNAVAILABLE'), '3.1 Rejects ONLINE_UPI with PAYMENT_PROVIDER_UNAVAILABLE');
    }
    assert(threw, '3.2 Rejected disabled online payment');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Stock Exhaustion & Insufficient Stock Rejection
  // --------------------------------------------------------------------------
  {
    log('Running Test 4: Insufficient Stock Rejection...');
    // TEST-PROD-002 has exactly 1 in stock
    const keyHash1 = crypto.createHash('sha256').update('real-test-stock-1').digest('hex');
    const result1 = callRpc({
      p_key_hash: keyHash1,
      p_fingerprint: 'fp-stock-1',
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-002', quantity: 1, size: 'ONE_SIZE' }],
      p_payment_method: 'CASH_ON_DELIVERY',
    });
    assert(result1.status === 'CONFIRMED', '4.1 Acquired last item in stock');

    const prodAfter = queryJson(`SELECT row_to_json(p) FROM public.products p WHERE serial_number = 'TEST-PROD-002'`);
    assert(prodAfter.stock === 0, '4.2 Product stock is now exactly 0');

    // Next checkout attempt must fail with OUT_OF_STOCK
    let threw = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-stock-2').digest('hex'),
        p_fingerprint: 'fp-stock-2',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-002', quantity: 1, size: 'ONE_SIZE' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('OUT_OF_STOCK'), '4.3 Rejects checkout when stock is 0 with OUT_OF_STOCK');
    }
    assert(threw, '4.4 Out of stock rejected');

    // Ensure stock remained 0 and did NOT become negative
    const prodFinal = queryJson(`SELECT row_to_json(p) FROM public.products p WHERE serial_number = 'TEST-PROD-002'`);
    assert(prodFinal.stock === 0, '4.5 Stock remains 0 (no negative stock)');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Hidden, Inactive, and Nonexistent Product Rejection
  // --------------------------------------------------------------------------
  {
    log('Running Test 5: Inactive and Nonexistent Product Rejection...');
    // Inactive product TEST-PROD-INACTIVE
    let threwInactive = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-inactive-1').digest('hex'),
        p_fingerprint: 'fp-inactive-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-INACTIVE', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threwInactive = true;
      assert(err.message.includes('PRODUCT_NOT_ORDERABLE'), '5.1 Inactive product rejected with PRODUCT_NOT_ORDERABLE');
    }
    assert(threwInactive, '5.2 Inactive product checkout blocked');

    // Nonexistent product
    let threwNonexistent = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-nonexistent-1').digest('hex'),
        p_fingerprint: 'fp-nonexistent-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'DOES-NOT-EXIST', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threwNonexistent = true;
      assert(err.message.includes('PRODUCT_NOT_ORDERABLE'), '5.3 Nonexistent product rejected with PRODUCT_NOT_ORDERABLE');
    }
    assert(threwNonexistent, '5.4 Nonexistent product checkout blocked');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Invalid Variant & Size Rejection
  // --------------------------------------------------------------------------
  {
    log('Running Test 6: Invalid Variant / Size Rejection...');
    // TEST-PROD-001 has sizes S, M, L. Requesting XXL must fail.
    let threw = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-size-1').digest('hex'),
        p_fingerprint: 'fp-size-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'XXL' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('INVALID_VARIANT'), '6.1 Invalid size rejected with INVALID_VARIANT');
    }
    assert(threw, '6.2 Size variant mismatch blocked');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Percentage & Flat Coupons + Usage Limits
  // --------------------------------------------------------------------------
  {
    log('Running Test 7: Coupon Validation, Calculation, and Usage Limits...');
    // 7.1 Valid Percentage Coupon: SAVE10 (10% off on subtotal 100000 -> 10000 discount)
    const keyHash1 = crypto.createHash('sha256').update('real-test-coupon-1').digest('hex');
    const result1 = callRpc({
      p_key_hash: keyHash1,
      p_fingerprint: 'fp-coupon-1',
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
      p_promo_code: 'SAVE10',
    });
    assert(result1.discount === 10000, '7.1.1 10% discount applied: 10000 paise');
    assert(result1.totalAmount === 99000, '7.1.2 Total amount: (100000 - 10000) + 9000 = 99000 paise');

    // Verify coupon usage_count incremented to 1
    const couponInDb = queryJson(`SELECT row_to_json(c) FROM public.coupons c WHERE code = 'SAVE10'`);
    assert(couponInDb.usage_count === 1, '7.1.3 Coupon usage_count incremented in database');

    // 7.2 Valid Flat Coupon: FLAT150 (₹150 / 15000 paise off)
    const keyHash2 = crypto.createHash('sha256').update('real-test-coupon-2').digest('hex');
    const result2 = callRpc({
      p_key_hash: keyHash2,
      p_fingerprint: 'fp-coupon-2',
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
      p_promo_code: 'FLAT150',
    });
    assert(result2.discount === 15000, '7.2.1 Flat discount applied: 15000 paise');
    assert(result2.totalAmount === 94000, '7.2.2 Total amount: (100000 - 15000) + 9000 = 94000 paise');

    // 7.3 Expired Coupon Rejection
    let threwExpired = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-expired-1').digest('hex'),
        p_fingerprint: 'fp-expired-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
        p_promo_code: 'EXPIRED',
      });
    } catch (err) {
      threwExpired = true;
      assert(err.message.includes('COUPON_REQUIRED'), '7.3.1 Expired coupon rejected with COUPON_REQUIRED');
    }
    assert(threwExpired, '7.3.2 Expired coupon blocked');

    // 7.4 Exhausted Coupon Rejection
    let threwExhausted = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-exhausted-1').digest('hex'),
        p_fingerprint: 'fp-exhausted-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
        p_promo_code: 'EXHAUSTED',
      });
    } catch (err) {
      threwExhausted = true;
      assert(err.message.includes('COUPON_REQUIRED'), '7.4.1 Exhausted coupon rejected with maximum usage limit');
    }
    assert(threwExhausted, '7.4.2 Exhausted coupon blocked');
  }

  // --------------------------------------------------------------------------
  // TEST 8: Idempotency Replay & Payload Mismatch Protection
  // --------------------------------------------------------------------------
  {
    log('Running Test 8: Idempotency Replay & Fingerprint Protection...');
    const keyHash = crypto.createHash('sha256').update('real-test-idem-replay-1').digest('hex');
    const fingerprint1 = crypto.createHash('sha256').update('payload-original').digest('hex');

    // 8.1 First execution: creates order
    const result1 = callRpc({
      p_key_hash: keyHash,
      p_fingerprint: fingerprint1,
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
    });
    const firstOrderNumber = result1.orderNumber;
    assert(firstOrderNumber.startsWith('ORD-'), '8.1.1 First call generated order number');

    // Check stock after first call
    const stockAfterFirst = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001'`);

    // 8.2 Second execution with same key and same fingerprint: replays exact response
    const result2 = callRpc({
      p_key_hash: keyHash,
      p_fingerprint: fingerprint1,
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
    });
    assert(result2.orderNumber === firstOrderNumber, '8.2.1 Replayed exact original order number');
    assert(result2.id === result1.id, '8.2.2 Replayed exact original order id');

    // Verify stock was NOT decremented a second time
    const stockAfterSecond = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001'`);
    assert(stockAfterSecond === stockAfterFirst, '8.2.3 Stock was NOT decremented on replayed request');

    // 8.3 Third execution with same key but DIFFERENT fingerprint: rejects with IDEMPOTENCY_MISMATCH
    const fingerprint2 = crypto.createHash('sha256').update('payload-tampered-different').digest('hex');
    let threwMismatch = false;
    try {
      callRpc({
        p_key_hash: keyHash,
        p_fingerprint: fingerprint2,
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threwMismatch = true;
      assert(err.message.includes('IDEMPOTENCY_KEY_REUSED'), '8.3.1 Rejects altered request on same key with IDEMPOTENCY_KEY_REUSED');
    }
    assert(threwMismatch, '8.3.2 Idempotency key alteration prevented');
  }

  // --------------------------------------------------------------------------
  // TEST 9: Transaction Atomicity & Failure Rollback
  // --------------------------------------------------------------------------
  {
    log('Running Test 9: Transaction Atomicity on Mid-Flight Failure...');
    // Restore stock and published status of TEST-PROD-001 to 5
    runSql(`UPDATE public.products SET stock = 5, status = 'PUBLISHED' WHERE serial_number = 'TEST-PROD-001';`);

    const orderCountBefore = queryJson(`SELECT count(*) FROM public.orders;`);

    // Multi-item order: first item is valid, second item is invalid size
    let threw = false;
    try {
      callRpc({
        p_key_hash: crypto.createHash('sha256').update('real-test-atomic-fail-1').digest('hex'),
        p_fingerprint: 'fp-atomic-1',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [
          { serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' },
          { serialNumber: 'TEST-PROD-001', quantity: 1, size: 'INVALID_SIZE' },
        ],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('INVALID_VARIANT'), '9.1 Aborted on invalid variant in multi-item order');
    }
    assert(threw, '9.2 Multi-item failure thrown');

    // Verify stock of valid item was rolled back and NOT decremented
    const stockAfter = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
    assert(stockAfter === 5, '9.3 Stock of valid item rolled back (remains 5)');

    // Verify zero orders were created
    const orderCountAfter = queryJson(`SELECT count(*) FROM public.orders;`);
    assert(orderCountAfter === orderCountBefore, '9.4 No orders created in orders table');
  }

  // --------------------------------------------------------------------------
  // TEST 10: Zero Plaintext Guest Token in DB
  // --------------------------------------------------------------------------
  {
    log('Running Test 10: Zero Plaintext Guest Token Persistence...');
    const rawGuestToken = 'super-secret-raw-guest-token-1234567890abcdef';
    const guestHash = crypto.createHash('sha256').update(rawGuestToken).digest('hex');

    const result = callRpc({
      p_key_hash: crypto.createHash('sha256').update('real-test-guest-secret-1').digest('hex'),
      p_fingerprint: 'fp-guest-secret-1',
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
      p_guest_access_token_hash: guestHash,
      p_guest_access_expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    // Check cached idempotency payload in database
    const cachedPayload = queryJson(`SELECT response_payload FROM public.checkout_idempotency WHERE order_number = '${result.orderNumber}';`);
    assert(cachedPayload.guestAccessToken === null, '10.1 response_payload.guestAccessToken is NULL in DB');

    // Search the entire orders and idempotency rows for the plaintext token string
    const plaintextFoundInOrders = queryJson(`SELECT count(*) > 0 FROM public.orders WHERE notes LIKE '%${rawGuestToken}%' OR guest_access_token_hash LIKE '%${rawGuestToken}%';`);
    assert(plaintextFoundInOrders === false, '10.2 Raw token never appears in orders table');

    const plaintextFoundInIdempotency = queryJson(`SELECT count(*) > 0 FROM public.checkout_idempotency WHERE response_payload::text LIKE '%${rawGuestToken}%';`);
    assert(plaintextFoundInIdempotency === false, '10.3 Raw token never appears anywhere in checkout_idempotency table');
  }

  // --------------------------------------------------------------------------
  // TEST 11: Idempotency Cleanup Function & Expiry Pruning
  // --------------------------------------------------------------------------
  {
    log('Running Test 11: Idempotency Cleanup Function Execution...');
    // Insert an expired completed record and an active record
    runSql(`
      INSERT INTO public.checkout_idempotency (key_hash, fingerprint, order_number, expires_at, response_payload)
      VALUES
        ('hash-expired-1', 'fp-expired', 'ORD-EXP-1', now() - interval '1 hour', '{"status":"CONFIRMED"}'::jsonb),
        ('hash-active-1', 'fp-active', 'ORD-ACT-1', now() + interval '24 hours', '{"status":"CONFIRMED"}'::jsonb);
    `);

    // Execute cleanup function
    const deletedCount = queryJson(`SELECT public.cleanup_expired_idempotency_keys();`);
    assert(deletedCount >= 1, '11.1 cleanup_expired_idempotency_keys deleted at least 1 expired record');

    // Verify expired record is gone and active record remains
    const expiredExists = queryJson(`SELECT count(*) > 0 FROM public.checkout_idempotency WHERE key_hash = 'hash-expired-1';`);
    assert(expiredExists === false, '11.2 Expired idempotency record was removed');

    const activeExists = queryJson(`SELECT count(*) > 0 FROM public.checkout_idempotency WHERE key_hash = 'hash-active-1';`);
    assert(activeExists === true, '11.3 Active idempotency record was preserved');
  }

  // --------------------------------------------------------------------------
  // TEST 12: Security Privileges & RLS Enforcement (Anon/Auth direct access)
  // --------------------------------------------------------------------------
  {
    log('Running Test 12: Security Roles & Direct RLS Bypass Prevention...');

    // 12.1 Anonymous user attempting to call process_storefront_checkout directly must fail (revoked)
    let anonRpcThrew = false;
    try {
      callRpc({
        p_key_hash: 'anon-key',
        p_fingerprint: 'anon-fp',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      }, 'anon');
    } catch (err) {
      anonRpcThrew = true;
      assert(err.message.includes('permission denied'), '12.1 Anonymous user direct RPC call blocked (permission denied)');
    }
    assert(anonRpcThrew, '12.2 Anonymous execution blocked');

    // 12.2 Authenticated user attempting to call process_storefront_checkout directly must fail (revoked)
    let authRpcThrew = false;
    try {
      callRpc({
        p_key_hash: 'auth-key',
        p_fingerprint: 'auth-fp',
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      }, 'authenticated');
    } catch (err) {
      authRpcThrew = true;
      assert(err.message.includes('permission denied'), '12.3 Authenticated customer direct RPC call blocked (permission denied)');
    }
    assert(authRpcThrew, '12.4 Authenticated execution blocked');

    // 12.3 Anonymous user attempting to directly insert into checkout_idempotency must fail (RLS)
    let anonInsertThrew = false;
    try {
      runSql(`
        INSERT INTO public.checkout_idempotency (key_hash, fingerprint, order_number, expires_at)
        VALUES ('hacked-key', 'hacked-fp', 'ORD-HACK', now() + interval '1 hour');
      `, 'anon');
    } catch (err) {
      anonInsertThrew = true;
      assert(err.message.includes('row-level security') || err.message.includes('permission denied') || err.message.includes('violates row-level security policy'), '12.5 Direct anon insert into checkout_idempotency blocked by RLS');
    }
    assert(anonInsertThrew, '12.6 Idempotency table RLS enforced');
  }

  // --------------------------------------------------------------------------
  // TEST 13: Search Path Security Verification
  // --------------------------------------------------------------------------
  {
    log('Running Test 13: search_path Security Configuration...');
    const procDef = queryJson(`
      SELECT prosrc FROM pg_proc WHERE proname = 'process_storefront_checkout';
    `);
    const proconfig = queryJson(`
      SELECT proconfig FROM pg_proc WHERE proname = 'process_storefront_checkout';
    `);
    assert(Array.isArray(proconfig) && proconfig.some((c) => c.startsWith('search_path=')), '13.1 process_storefront_checkout has pinned SET search_path = \'\'');

    const cleanupConfig = queryJson(`
      SELECT proconfig FROM pg_proc WHERE proname = 'cleanup_expired_idempotency_keys';
    `);
    assert(Array.isArray(cleanupConfig) && cleanupConfig.some((c) => c.startsWith('search_path=')), '13.2 cleanup_expired_idempotency_keys has pinned SET search_path = \'\'');
  }

  // --------------------------------------------------------------------------
  // TEST 14: Concurrent Race Condition & Mutex Protection
  // --------------------------------------------------------------------------
  {
    log('Running Test 14: Concurrent Checkout Race Condition...');
    runSql(`
      INSERT INTO public.products (id, serial_number, name, slug, category, price, stock, sizes, status)
      VALUES (
        '88888888-8888-8888-8888-888888888888',
        'TEST-CONCURRENT-1',
        'One-of-a-Kind Vintage Leather Biker',
        'vintage-leather-biker',
        'mens-outerwear',
        300000,
        1,
        ARRAY['L'],
        'PUBLISHED'
      ) ON CONFLICT (serial_number) DO UPDATE SET stock = 1, status = 'PUBLISHED';
    `);

    // Launch two checkout requests simultaneously for the same 1-stock item
    const p1 = callRpcAsync({
      p_key_hash: 'concurrent-key-1',
      p_fingerprint: 'concurrent-fp-1',
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-CONCURRENT-1', quantity: 1, size: 'L' }],
      p_payment_method: 'CASH_ON_DELIVERY',
    });

    const p2 = callRpcAsync({
      p_key_hash: 'concurrent-key-2',
      p_fingerprint: 'concurrent-fp-2',
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-CONCURRENT-1', quantity: 1, size: 'L' }],
      p_payment_method: 'CASH_ON_DELIVERY',
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    assert(successes.length === 1, '14.1 Exactly 1 concurrent request succeeded');
    assert(failures.length === 1, '14.2 Exactly 1 concurrent request failed');
    assert(failures[0].error.includes('OUT_OF_STOCK'), '14.3 Failing concurrent request failed with OUT_OF_STOCK');

    const stock = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-CONCURRENT-1';`);
    assert(stock === 0, '14.4 Final stock is 0 (no negative stock, no double decrement)');
  }

  // --------------------------------------------------------------------------
  // TEST 15: Idempotency Cleanup Concurrency Races
  // --------------------------------------------------------------------------
  {
    log('Running Test 15: Idempotency Cleanup Concurrency Races...');

    // 15.1.A Outcome A: Retry wins before cleanup (Key still active within 24h TTL)
    // Policy: Completed checkouts maintain a 24-hour time-bounded TTL. During this window,
    // identical retries replay the cached response with zero duplicate inventory deduction.
    {
      runSql(`UPDATE public.products SET stock = 5, status = 'PUBLISHED' WHERE serial_number = 'TEST-PROD-001';`);
      const keyHashA = crypto.createHash('sha256').update('race-outcome-a-key-1').digest('hex');
      const fpA = crypto.createHash('sha256').update('fp-race-outcome-a-1').digest('hex');

      // Place initial order
      const initialResA = callRpc({
        p_key_hash: keyHashA,
        p_fingerprint: fpA,
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
      const orderNumA = initialResA.orderNumber;
      assert(initialResA.status === 'CONFIRMED', '15.1.A.1 Initial order created');

      const stockAfterA = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
      const ordersAfterA = queryJson(`SELECT count(*) FROM public.orders;`);

      // Race cleanup with an identical retry while key is valid (expires_at > now())
      const [cleanResA, retryResA] = await Promise.all([
        callCleanupAsync(),
        callRpcAsync({
          p_key_hash: keyHashA,
          p_fingerprint: fpA,
          p_customer: baseCustomer,
          p_shipping_address: baseAddress,
          p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
          p_payment_method: 'CASH_ON_DELIVERY',
        }),
      ]);

      assert(cleanResA.success === true, '15.1.A.2 Cleanup completed during active retry');
      assert(retryResA.success === true, '15.1.A.3 Retry succeeded');
      assert(retryResA.data.orderNumber === orderNumA, '15.1.A.4 Outcome A: Original order is replayed');

      const stockFinalA = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
      const ordersFinalA = queryJson(`SELECT count(*) FROM public.orders;`);
      assert(stockFinalA === stockAfterA, '15.1.A.5 Outcome A: Inventory is not decremented again');
      assert(ordersFinalA === ordersAfterA, '15.1.A.6 Outcome A: Exactly one order exists for the request');
    }

    // 15.1.B Outcome B: Cleanup wins before retry (Post-expiry policy)
    // Policy: Once the 24-hour TTL has elapsed, the idempotency window closes. Once pruned,
    // subsequent requests with the retired key are treated as fresh checkouts, creating a new
    // order and decrementing stock according to live availability.
    {
      const keyHashB = crypto.createHash('sha256').update('race-outcome-b-key-1').digest('hex');
      const fpB = crypto.createHash('sha256').update('fp-race-outcome-b-1').digest('hex');

      // Place initial order
      const initialResB = callRpc({
        p_key_hash: keyHashB,
        p_fingerprint: fpB,
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
      const orderNumB = initialResB.orderNumber;

      const stockBeforePruning = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
      const ordersBeforePruning = queryJson(`SELECT count(*) FROM public.orders;`);

      // Expire the record
      runSql(`
        UPDATE public.checkout_idempotency
        SET expires_at = now() - interval '10 seconds'
        WHERE key_hash = '${keyHashB}';
      `);

      // Cleanup executes first and prunes the expired record
      const prunedCount = queryJson(`SELECT public.cleanup_expired_idempotency_keys();`);
      assert(prunedCount >= 1, '15.1.B.1 Outcome B: Cleanup purged expired idempotency record');

      const keyExistsAfterPrune = queryJson(`SELECT count(*) > 0 FROM public.checkout_idempotency WHERE key_hash = '${keyHashB}';`);
      assert(keyExistsAfterPrune === false, '15.1.B.2 Outcome B: Expired key is confirmed removed from database');

      // Subsequent retry arrives after cleanup pruned the key
      const postExpiryRes = callRpc({
        p_key_hash: keyHashB,
        p_fingerprint: fpB,
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });

      assert(postExpiryRes.status === 'CONFIRMED', '15.1.B.3 Outcome B: Post-expiry checkout confirmed');
      assert(postExpiryRes.orderNumber !== orderNumB, '15.1.B.4 Outcome B: Fresh order generated under post-expiry policy');

      const stockAfterPostExpiry = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
      const ordersAfterPostExpiry = queryJson(`SELECT count(*) FROM public.orders;`);
      assert(stockAfterPostExpiry === stockBeforePruning - 1, '15.1.B.5 Outcome B: Inventory decremented exactly once for new order');
      assert(ordersAfterPostExpiry === ordersBeforePruning + 1, '15.1.B.6 Outcome B: Exactly one new order added');

      const activeRecordCount = queryJson(`SELECT count(*) FROM public.checkout_idempotency WHERE key_hash = '${keyHashB}' AND response_payload IS NOT NULL;`);
      assert(activeRecordCount === 1, '15.1.B.7 Outcome B: Clean new 24h idempotency record established; zero partial reservations');
    }

    // 15.2 Cleanup racing with a new request using an expired key
    {
      const expiredKeyHash = crypto.createHash('sha256').update('race-expired-new-key-1').digest('hex');
      const oldFingerprint = crypto.createHash('sha256').update('old-fp-expired').digest('hex');
      const newFingerprint = crypto.createHash('sha256').update('new-fp-different').digest('hex');

      // Insert an expired record with old fingerprint
      runSql(`
        INSERT INTO public.checkout_idempotency (key_hash, fingerprint, order_number, expires_at, response_payload)
        VALUES ('${expiredKeyHash}', '${oldFingerprint}', 'ORD-OLD-EXP', now() - interval '1 minute', '{"status":"CONFIRMED"}'::jsonb)
        ON CONFLICT (key_hash) DO UPDATE SET expires_at = now() - interval '1 minute', fingerprint = '${oldFingerprint}';
      `);

      // Race cleanup with a new request having different fingerprint
      const [cleanRes, newReqRes] = await Promise.all([
        callCleanupAsync(),
        callRpcAsync({
          p_key_hash: expiredKeyHash,
          p_fingerprint: newFingerprint,
          p_customer: baseCustomer,
          p_shipping_address: baseAddress,
          p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
          p_payment_method: 'CASH_ON_DELIVERY',
        }),
      ]);

      assert(cleanRes.success === true, '15.2.1 Cleanup completed during expired key race');
      assert(newReqRes.success === true, '15.2.2 New request on expired key succeeded (not rejected as IDEMPOTENCY_KEY_REUSED)');
      assert(newReqRes.data.orderNumber !== 'ORD-OLD-EXP', '15.2.3 New request generated a fresh order');
    }

    // 15.3 Deterministic Concurrency: Expired Completed Record vs Simultaneous Retries with Transaction Barrier
    {
      log('Running Test 15.3: Transaction Barrier Concurrency on Expired Record with Retries & Cleanup...');
      runSql(`UPDATE public.products SET stock = 5, status = 'PUBLISHED' WHERE serial_number = 'TEST-PROD-001';`);

      const barrierKeyHash = crypto.createHash('sha256').update('race-barrier-expired-key-1').digest('hex');
      const barrierFp = crypto.createHash('sha256').update('fp-race-barrier-expired-1').digest('hex');

      // Insert expired completed record
      runSql(`
        INSERT INTO public.checkout_idempotency (key_hash, fingerprint, order_number, expires_at, response_payload)
        VALUES ('${barrierKeyHash}', '${barrierFp}', 'ORD-BARRIER-OLD', now() - interval '2 hours', '{"status":"CONFIRMED"}'::jsonb)
        ON CONFLICT (key_hash) DO UPDATE SET expires_at = now() - interval '2 hours', response_payload = '{"status":"CONFIRMED"}'::jsonb;
      `);

      const stockBeforeBarrier = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
      const ordersBeforeBarrier = queryJson(`SELECT count(*) FROM public.orders;`);

      // 1. Establish PostgreSQL transaction barrier: hold exclusive row lock on the expired record
      const barrier = await createTransactionBarrier(barrierKeyHash);

      // 2. Queue Workers: Cleanup + 2 simultaneous retries
      // All workers will queue behind the barrier lock in PostgreSQL
      const cleanupPromise = callCleanupAsync();
      const retryPromiseA = callRpcAsync({
        p_key_hash: barrierKeyHash,
        p_fingerprint: barrierFp,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
      const retryPromiseB = callRpcAsync({
        p_key_hash: barrierKeyHash,
        p_fingerprint: barrierFp,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });

      // Brief wait to ensure all 3 workers have reached PostgreSQL and blocked
      await new Promise((r) => setTimeout(r, 400));

      // 3. Release the transaction barrier simultaneously
      await barrier.release();

      // 4. Await all competing workers
      const [cleanRes, retryA, retryB] = await Promise.all([cleanupPromise, retryPromiseA, retryPromiseB]);

      // 5. Verify results
      assert(cleanRes.success === true, '15.3.1 Cleanup succeeded without deadlock');
      assert(retryA.success === true, '15.3.2 Retry A succeeded');
      assert(retryB.success === true, '15.3.3 Retry B succeeded');

      assert(retryA.data.orderNumber === retryB.data.orderNumber, '15.3.4 Both retries agreed on the exact same order number');
      assert(retryA.data.orderNumber !== 'ORD-BARRIER-OLD', '15.3.5 New order generated post-expiry');

      const stockAfterBarrier = queryJson(`SELECT stock FROM public.products WHERE serial_number = 'TEST-PROD-001';`);
      const ordersAfterBarrier = queryJson(`SELECT count(*) FROM public.orders;`);

      assert(stockAfterBarrier === stockBeforeBarrier - 1, '15.3.6 Zero unintended duplicate stock deduction (exactly 1 unit deducted across dual retries)');
      assert(ordersAfterBarrier === ordersBeforeBarrier + 1, '15.3.7 Zero duplicate orders beyond post-expiry policy (exactly 1 new order created)');

      const orphanedReservations = queryJson(`SELECT count(*) FROM public.checkout_idempotency WHERE key_hash = '${barrierKeyHash}' AND response_payload IS NULL;`);
      assert(orphanedReservations === 0, '15.3.8 Zero orphaned idempotency reservations left in database');

      const committedRecordCount = queryJson(`SELECT count(*) FROM public.checkout_idempotency WHERE key_hash = '${barrierKeyHash}' AND response_payload IS NOT NULL;`);
      assert(committedRecordCount === 1, '15.3.9 Exactly 1 completed idempotency record committed');
    }
  }

  // --------------------------------------------------------------------------
  // TEST 16: Failed Checkout Key Usability & Isolation
  // --------------------------------------------------------------------------
  {
    log('Running Test 16: Failed Checkout Key Isolation & Immediate Reusability...');
    // Ensure product has stock for variant test
    runSql(`UPDATE public.products SET stock = 5, status = 'PUBLISHED' WHERE serial_number = 'TEST-PROD-001';`);

    const failKeyHash = crypto.createHash('sha256').update('key-failed-isolation-1').digest('hex');
    const failFingerprint = crypto.createHash('sha256').update('fp-failed-isolation-1').digest('hex');

    // 16.1 Deliberately attempt checkout that fails variant validation
    let threwFailed = false;
    try {
      callRpc({
        p_key_hash: failKeyHash,
        p_fingerprint: failFingerprint,
        p_customer_id: null,
        p_customer: baseCustomer,
        p_shipping_address: baseAddress,
        p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'NONEXISTENT_SIZE' }],
        p_payment_method: 'CASH_ON_DELIVERY',
      });
    } catch (err) {
      threwFailed = true;
      assert(err.message.includes('INVALID_VARIANT'), '16.1.1 First attempt rejected with INVALID_VARIANT');
    }
    assert(threwFailed, '16.1.2 Transaction aborted on invalid variant');

    // 16.2 Verify that transaction rollback leaves zero record in checkout_idempotency
    const idemCountAfterFail = queryJson(`SELECT count(*) FROM public.checkout_idempotency WHERE key_hash = '${failKeyHash}';`);
    assert(idemCountAfterFail === 0, '16.2 Failed checkout rolled back; zero idempotency rows left in DB');

    // 16.3 Immediately retry with the EXACT same key_hash and fingerprint, but valid payload
    const validRetryRes = callRpc({
      p_key_hash: failKeyHash,
      p_fingerprint: failFingerprint,
      p_customer_id: null,
      p_customer: baseCustomer,
      p_shipping_address: baseAddress,
      p_items: [{ serialNumber: 'TEST-PROD-001', quantity: 1, size: 'M' }],
      p_payment_method: 'CASH_ON_DELIVERY',
    });

    assert(validRetryRes.status === 'CONFIRMED', '16.3.1 Valid request with same key immediately succeeded with CONFIRMED');
    assert(validRetryRes.orderNumber.startsWith('ORD-'), '16.3.2 Valid order number generated');

    const idemCountAfterValid = queryJson(`SELECT count(*) FROM public.checkout_idempotency WHERE key_hash = '${failKeyHash}';`);
    assert(idemCountAfterValid === 1, '16.3.3 Exactly 1 committed idempotency record exists for completed order');
  }

  console.log('\n============================================================');
  console.log(`🎉 ALL REAL POSTGRESQL INTEGRATION TESTS PASSED!`);
  console.log(`   Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('============================================================\n');
}

async function main() {
  let exitCode = 0;
  try {
    await startContainer();
    applyMigrations();
    seedTestData();
    await runTests();
  } catch (err) {
    console.error('\n❌ FATAL INTEGRATION TEST FAILURE:', err);
    exitCode = 1;
  } finally {
    stopContainer();
  }
  process.exit(exitCode);
}

main();
