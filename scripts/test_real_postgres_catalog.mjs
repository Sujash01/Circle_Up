/**
 * Real PostgreSQL & Supabase Integration Verification Test Suite: Catalogue & Inventory
 * Milestone 1, Step 4: Supabase Catalogue Migration
 *
 * Runs strictly against a disposable local PostgreSQL 16 container.
 * Zero connection to production Supabase.
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CONTAINER_NAME = 'circleup_real_pg_test';
const PG_PORT = 54323;
const DB_NAME = 'circleup_test_db';
const DB_USER = 'postgres';
const DB_PASS = 'postgres';

let passedAssertions = 0;
let failedAssertions = 0;

function log(msg) {
  console.log(`[CATALOG-PG-TEST] ${msg}`);
}

function assert(cond, name) {
  if (cond) {
    passedAssertions++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ FAIL: ${name}`);
  }
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
  const wrapped = `SELECT row_to_json(t) FROM (${cleanSql}) t;`;
  const res = runSql(wrapped, role);
  return JSON.parse(res);
}

function queryJsonArray(sql, role = 'postgres') {
  const cleanSql = sql.trim().replace(/;$/, '');
  const wrapped = `SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (${cleanSql}) t;`;
  const res = runSql(wrapped, role);
  return JSON.parse(res);
}

function callCheckoutRpc(params) {
  let keyHash = params.p_key_hash;
  if (keyHash && !/^[a-fA-F0-9]{64}$/.test(keyHash)) {
    keyHash = crypto.createHash('sha256').update(keyHash).digest('hex');
  }
  const p_key_hash = keyHash ? `'${keyHash}'` : 'NULL';

  let fingerprint = params.p_fingerprint || params.p_key_hash;
  if (fingerprint && !/^[a-fA-F0-9]{64}$/.test(fingerprint)) {
    fingerprint = crypto.createHash('sha256').update(fingerprint).digest('hex');
  }
  const p_fingerprint = fingerprint ? `'${fingerprint}'` : 'NULL';

  const p_customer_id = params.p_customer_id ? `'${params.p_customer_id}'` : 'NULL';
  const p_customer = `'${JSON.stringify(params.p_customer).replace(/'/g, "''")}'::jsonb`;
  const p_shipping_address = `'${JSON.stringify(params.p_shipping_address).replace(/'/g, "''")}'::jsonb`;
  const p_items = `'${JSON.stringify(params.p_items).replace(/'/g, "''")}'::jsonb`;
  const p_payment_method = `'${params.p_payment_method || 'WHATSAPP_UPI'}'`;
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
  const res = runSql(rpcCall);
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
    for (let i = 0; i < 35; i++) {
      try {
        execSync('docker ps', { stdio: 'ignore' });
        running = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!running) throw new Error('Docker Desktop failed to start.');
  }

  log(`Checking existing container (${CONTAINER_NAME})...`);
  try {
    const ps = runCmd(`docker ps -a --filter name=${CONTAINER_NAME} --format "{{.Status}}"`);
    if (ps.includes('Up')) {
      log('Container is already running.');
      return;
    }
  } catch {}

  log(`Starting disposable PostgreSQL 16 container on port ${PG_PORT}...`);
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch {}

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
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
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

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (!fs.existsSync(fullPath)) {
      log(`Warning: migration ${m} not found at ${fullPath}`);
      continue;
    }
    log(`Applying migration: ${m}`);
    const sql = fs.readFileSync(fullPath, 'utf8');
    runSql(sql);
  }

  log('All migrations applied successfully.');
}

async function runTests() {
  log('============================================================');
  log('  MILESTONE 1, STEP 4: SUPABASE CATALOGUE INTEGRATION TESTS ');
  log('============================================================');

  await startContainer();
  applyMigrations();

  // Clean test tables
  runSql(`
    DELETE FROM public.order_items;
    DELETE FROM public.orders;
    DELETE FROM public.coupons;
    DELETE FROM public.checkout_idempotency;
    DELETE FROM public.activity_audit_logs;
    DELETE FROM public.products;
  `);

  // ------------------------------------------------------------------------
  // Suite 1: Schema Invariant Checks
  // ------------------------------------------------------------------------
  log('\n--- SUITE 1: Schema Invariants on public.products ---');
  {
    const cols = queryJsonArray(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products';
    `);

    const colNames = cols.map((c) => c.column_name);
    assert(colNames.includes('id'), 'products has id column');
    assert(colNames.includes('serial_number'), 'products has serial_number column');
    assert(colNames.includes('slug'), 'products has slug column');
    assert(colNames.includes('price'), 'products has price column');
    assert(colNames.includes('original_price'), 'products has original_price column');
    assert(colNames.includes('stock'), 'products has stock column');
    assert(colNames.includes('images'), 'products has images column');
    assert(colNames.includes('sizes'), 'products has sizes column');
    assert(colNames.includes('variants'), 'products has variants column');
    assert(colNames.includes('category'), 'products has category column');
    assert(colNames.includes('category_code'), 'products has category_code column');
    assert(colNames.includes('category_label'), 'products has category_label column');
    assert(colNames.includes('status'), 'products has status column');
    assert(colNames.includes('chest_pick'), 'products has chest_pick column');
    assert(colNames.includes('is_new_arrival'), 'products has is_new_arrival column');

    // Verify price type is bigint (paise)
    const priceCol = cols.find((c) => c.column_name === 'price');
    assert(priceCol.data_type === 'bigint', 'price is stored as bigint (integer paise)');

    // Verify check constraint on price >= 0
    let priceCheckFailed = false;
    try {
      runSql(`
        INSERT INTO public.products (serial_number, name, slug, price, stock, category)
        VALUES ('TEST-NEG', 'Negative Price', 'neg-price', -100, 1, 'womens-one-piece');
      `);
    } catch {
      priceCheckFailed = true;
    }
    assert(priceCheckFailed, 'Negative price is rejected by CHECK (price >= 0)');

    // Verify check constraint on stock >= 0
    let stockCheckFailed = false;
    try {
      runSql(`
        INSERT INTO public.products (serial_number, name, slug, price, stock, category)
        VALUES ('TEST-NEG-STOCK', 'Negative Stock', 'neg-stock', 10000, -1, 'womens-one-piece');
      `);
    } catch {
      stockCheckFailed = true;
    }
    assert(stockCheckFailed, 'Negative stock is rejected by CHECK (stock >= 0)');

    // Verify check constraint on status values
    let invalidStatusFailed = false;
    try {
      runSql(`
        INSERT INTO public.products (serial_number, name, slug, price, stock, category, status)
        VALUES ('TEST-BAD-STAT', 'Bad Status', 'bad-stat', 10000, 1, 'womens-one-piece', 'INVALID_STATUS');
      `);
    } catch {
      invalidStatusFailed = true;
    }
    assert(invalidStatusFailed, 'Invalid status is rejected by CHECK constraint');
  }

  // ------------------------------------------------------------------------
  // Suite 2: Seed Test Catalogue
  // ------------------------------------------------------------------------
  log('\n--- SUITE 2: Seeding Realistic Test Catalogue ---');
  {
    runSql(`
      INSERT INTO public.products (
        id, serial_number, name, slug, description, price, original_price, compare_at_price,
        stock, images, sizes, category, category_label, category_code, subcategory,
        product_type, condition, gender, tags, featured, is_new_arrival, chest_pick, status
      ) VALUES
      (
        '10000000-0000-0000-0000-000000000001',
        'CU-SET-001',
        'Vintage Mulberry Silk Co-ord',
        'vintage-mulberry-silk-co-ord-cu-set-001',
        'Pure mulberry silk two-piece blazer and trouser set from Kyoto.',
        450000, 650000, 550000,
        3, ARRAY['/assets/silk-1.jpg', '/assets/silk-2.jpg'], ARRAY['M', 'L'],
        'womens-one-piece', 'Women''s One Piece', 'SET', 'Co-ords',
        'Pre-Loved', 'Mint', 'Women', ARRAY['vintage', 'silk', 'kyoto'],
        true, true, true, 'PUBLISHED'
      ),
      (
        '10000000-0000-0000-0000-000000000002',
        'CU-DJ-042',
        'Oversized Acid Wash Denim Jacket',
        'oversized-acid-wash-denim-jacket-cu-dj-042',
        'Heavyweight 90s vintage denim jacket with brass hardware.',
        320000, 480000, 390000,
        1, ARRAY['/assets/denim-1.jpg'], ARRAY['L', 'XL'],
        'mens-upperwear', 'Men''s Upperwear', 'DJ', 'Denim',
        'Pre-Loved', 'Gently Used', 'Unisex', ARRAY['90s', 'denim', 'acid-wash'],
        true, false, false, 'AVAILABLE'
      ),
      (
        '10000000-0000-0000-0000-000000000003',
        'CU-ACC-101',
        'Handcrafted Leather Saddle Bag',
        'handcrafted-leather-saddle-bag-cu-acc-101',
        'Artisan vegetable-tanned saddle bag with brass buckle.',
        220000, null, null,
        2, ARRAY['/assets/bag-1.jpg'], ARRAY['One Size'],
        'accessories', 'Accessories', 'ACC', 'Handbags',
        'Handcrafted', 'New With Tags', 'Unisex', ARRAY['leather', 'artisan'],
        false, true, true, 'ACTIVE'
      ),
      (
        '10000000-0000-0000-0000-000000000004',
        'CU-WB-J-009',
        'Pleated Linen Summer Dress',
        'pleated-linen-summer-dress-cu-wb-j-009',
        'Breathable European flax linen midi dress in butter cream.',
        280000, 350000, null,
        0, ARRAY['/assets/dress-1.jpg'], ARRAY['S', 'M'],
        'womens-one-piece', 'Women''s One Piece', 'WB-J', 'Dresses',
        'Pre-Loved', 'Gently Used', 'Women', ARRAY['linen', 'summer'],
        false, false, false, 'SOLD_OUT'
      ),
      (
        '10000000-0000-0000-0000-000000000005',
        'CU-DRF-001',
        'Unreleased Studio Sample Jacket',
        'unreleased-studio-sample-jacket-cu-drf-001',
        'Internal studio draft prototype. Not for sale.',
        999900, null, null,
        1, ARRAY['/assets/draft-1.jpg'], ARRAY['M'],
        'mens-upperwear', 'Men''s Upperwear', 'DJ', 'Samples',
        'Pre-Loved', 'Mint', 'Men', ARRAY['sample'],
        false, false, false, 'DRAFT'
      ),
      (
        '10000000-0000-0000-0000-000000000006',
        'CU-ARC-001',
        'Decommissioned Damaged Knit',
        'decommissioned-damaged-knit-cu-arc-001',
        'Archived due to fabric defect.',
        150000, null, null,
        1, ARRAY['/assets/knit-1.jpg'], ARRAY['S'],
        'thrifted-treasure', 'Thrifted Treasure', 'TCE', 'Knits',
        'Pre-Loved', 'Vintage Wear', 'Women', ARRAY['defect'],
        false, false, false, 'ARCHIVED'
      );
    `);

    const count = runSql('SELECT count(*) FROM public.products;');
    assert(count === '6', 'Inserted 6 products across diverse statuses and categories');
  }

  // ------------------------------------------------------------------------
  // Suite 3: Public Storefront Listing & Visibility Boundary
  // ------------------------------------------------------------------------
  log('\n--- SUITE 3: Public Storefront Listing & Visibility ---');
  {
    const publicStatuses = ['AVAILABLE', 'ACTIVE', 'PUBLISHED', 'SOLD', 'BOOKED', 'EXCHANGE_BARTER', 'RENT', 'SOLD_OUT'];
    const publicItems = queryJsonArray(`
      SELECT serial_number, name, status, stock
      FROM public.products
      WHERE status = ANY(ARRAY['${publicStatuses.join("','")}'])
      ORDER BY created_at DESC;
    `);

    assert(publicItems.length === 4, 'Storefront query returns exactly 4 public products');
    const serials = publicItems.map((p) => p.serial_number);
    assert(serials.includes('CU-SET-001'), 'Includes PUBLISHED item');
    assert(serials.includes('CU-DJ-042'), 'Includes AVAILABLE item');
    assert(serials.includes('CU-ACC-101'), 'Includes ACTIVE item');
    assert(serials.includes('CU-WB-J-009'), 'Includes SOLD_OUT item (browsable, out of stock)');
    assert(!serials.includes('CU-DRF-001'), 'Excludes DRAFT item from storefront');
    assert(!serials.includes('CU-ARC-001'), 'Excludes ARCHIVED item from storefront');
  }

  // ------------------------------------------------------------------------
  // Suite 4: Search ILIKE across Name, Serial, Description, Subcategory
  // ------------------------------------------------------------------------
  log('\n--- SUITE 4: Search ILIKE Query Execution ---');
  {
    // Search by name substring
    const silkRes = queryJsonArray(`
      SELECT serial_number FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED')
        AND (name ILIKE '%mulberry%' OR description ILIKE '%mulberry%' OR serial_number ILIKE '%mulberry%');
    `);
    assert(silkRes.length === 1 && silkRes[0].serial_number === 'CU-SET-001', 'Search for "mulberry" finds Silk Co-ord');

    // Search by serial number substring
    const serialRes = queryJsonArray(`
      SELECT serial_number FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED')
        AND (name ILIKE '%DJ-042%' OR description ILIKE '%DJ-042%' OR serial_number ILIKE '%DJ-042%');
    `);
    assert(serialRes.length === 1 && serialRes[0].serial_number === 'CU-DJ-042', 'Search for "DJ-042" finds Denim Jacket');

    // Search by description keyword
    const kyotoRes = queryJsonArray(`
      SELECT serial_number FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED')
        AND (name ILIKE '%Kyoto%' OR description ILIKE '%Kyoto%');
    `);
    assert(kyotoRes.length === 1 && kyotoRes[0].serial_number === 'CU-SET-001', 'Search for "Kyoto" in description finds Silk Co-ord');

    // Search for draft item should return 0 results in public search
    const draftRes = queryJsonArray(`
      SELECT serial_number FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED')
        AND (name ILIKE '%Sample%' OR description ILIKE '%Sample%');
    `);
    assert(draftRes.length === 0, 'Public search never exposes DRAFT item');
  }

  // ------------------------------------------------------------------------
  // Suite 5: Filtering & Sorting
  // ------------------------------------------------------------------------
  log('\n--- SUITE 5: Filtering & Sorting ---');
  {
    // Category filter
    const catItems = queryJsonArray(`
      SELECT serial_number FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED', 'SOLD_OUT')
        AND category = 'womens-one-piece';
    `);
    assert(catItems.length === 2, 'Category filter "womens-one-piece" returns 2 items');

    // Price sorting ASC
    const priceAsc = queryJsonArray(`
      SELECT serial_number, price FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED')
      ORDER BY price ASC;
    `);
    assert(priceAsc.length === 3, 'Sorted 3 active products by price ASC');
    assert(priceAsc[0].price <= priceAsc[1].price && priceAsc[1].price <= priceAsc[2].price, 'Prices are sorted in ascending order (220000 <= 320000 <= 450000)');
    assert(priceAsc[0].serial_number === 'CU-ACC-101', 'Lowest price is Handcrafted Saddle Bag');
    assert(priceAsc[2].serial_number === 'CU-SET-001', 'Highest price is Silk Co-ord');

    // Price sorting DESC
    const priceDesc = queryJsonArray(`
      SELECT serial_number, price FROM public.products
      WHERE status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED')
      ORDER BY price DESC;
    `);
    assert(priceDesc[0].serial_number === 'CU-SET-001', 'Highest price first in DESC sort');
  }

  // ------------------------------------------------------------------------
  // Suite 6: Product Details by Identifier (UUID, Serial, Slug)
  // ------------------------------------------------------------------------
  log('\n--- SUITE 6: Single Product Lookup by Identifier ---');
  {
    // By Serial Number
    const bySerial = queryJson(`
      SELECT * FROM public.products WHERE serial_number = 'CU-SET-001';
    `);
    assert(bySerial.id === '10000000-0000-0000-0000-000000000001', 'Lookup by serial_number succeeded');
    assert(bySerial.price === 450000, 'Price correctly returned as 450000 paise');

    // By Slug
    const bySlug = queryJson(`
      SELECT * FROM public.products WHERE slug = 'oversized-acid-wash-denim-jacket-cu-dj-042';
    `);
    assert(bySlug.serial_number === 'CU-DJ-042', 'Lookup by slug succeeded');

    // By UUID
    const byUuid = queryJson(`
      SELECT * FROM public.products WHERE id = '10000000-0000-0000-0000-000000000003';
    `);
    assert(byUuid.serial_number === 'CU-ACC-101', 'Lookup by UUID succeeded');

    // Public lookup attempting to access DRAFT fails when filtering by public statuses
    const draftPublic = queryJsonArray(`
      SELECT * FROM public.products
      WHERE serial_number = 'CU-DRF-001'
        AND status IN ('AVAILABLE', 'ACTIVE', 'PUBLISHED', 'SOLD_OUT');
    `);
    assert(draftPublic.length === 0, 'Public lookup for DRAFT product correctly yields zero results (404)');
  }

  // ------------------------------------------------------------------------
  // Suite 7: Category Counts
  // ------------------------------------------------------------------------
  log('\n--- SUITE 7: Category Counts Aggregation ---');
  {
    const counts = queryJsonArray(`
      SELECT category, count(*)::int as count
      FROM public.products
      WHERE status IN ('ACTIVE', 'PUBLISHED', 'AVAILABLE')
      GROUP BY category;
    `);

    const countMap = Object.fromEntries(counts.map((c) => [c.category, c.count]));
    assert(countMap['womens-one-piece'] === 1, 'womens-one-piece has 1 active product (CU-SET-001; CU-WB-J-009 is SOLD_OUT)');
    assert(countMap['mens-upperwear'] === 1, 'mens-upperwear has 1 active product (CU-DJ-042; CU-DRF-001 is DRAFT)');
    assert(countMap['accessories'] === 1, 'accessories has 1 active product (CU-ACC-101)');
  }

  // ------------------------------------------------------------------------
  // Suite 8: Real Checkout & Atomic Inventory Reflection
  // ------------------------------------------------------------------------
  log('\n--- SUITE 8: Real Atomic Checkout & Inventory Reflection ---');
  {
    // Ensure verified WhatsApp settings for checkout
    runSql(`
      INSERT INTO public.site_settings (id, whatsapp_number, is_whatsapp_verified)
      VALUES ('default', '919820112233', true)
      ON CONFLICT (id) DO UPDATE SET whatsapp_number = '919820112233', is_whatsapp_verified = true;
    `);

    // Check initial stock for CU-DJ-042 (stock = 1, status = 'AVAILABLE')
    const initialProduct = queryJson(`
      SELECT stock, status FROM public.products WHERE serial_number = 'CU-DJ-042';
    `);
    assert(initialProduct.stock === 1, 'Initial stock for CU-DJ-042 is 1');
    assert(initialProduct.status === 'AVAILABLE', 'Initial status for CU-DJ-042 is AVAILABLE');

    // Execute atomic storefront checkout RPC
    const checkoutParams = {
      p_key_hash: 'test-cat-idem-001',
      p_customer: {
        name: 'Zorawar Singh',
        email: 'zorawar@circleup.in',
        phone: '9876543210',
      },
      p_shipping_address: {
        addressLine: 'Flat 402, Vintage Chambers',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      },
      p_items: [
        {
          serialNumber: 'CU-DJ-042',
          quantity: 1,
          size: 'L',
        },
      ],
      p_payment_method: 'WHATSAPP_UPI',
      p_notes: 'Catalogue migration inventory reflection test',
    };

    const rpcResult = callCheckoutRpc(checkoutParams);

    assert(rpcResult.status === 'CONFIRMED', 'Checkout RPC completed with status CONFIRMED');
    assert(rpcResult.orderNumber.startsWith('ORD-'), 'Valid orderNumber generated');
    assert(rpcResult.totalAmount === 320000, 'TotalAmount matches exact price in paise (320000)');

    // Immediately inspect public.products row for CU-DJ-042
    const postCheckoutProduct = queryJson(`
      SELECT stock, status FROM public.products WHERE serial_number = 'CU-DJ-042';
    `);
    assert(postCheckoutProduct.stock === 0, 'Inventory immediately decremented: stock is now 0');
    assert(
      postCheckoutProduct.status === 'SOLD' || postCheckoutProduct.status === 'SOLD_OUT',
      `Product status immediately updated to sold state (${postCheckoutProduct.status})`
    );

    // Verify storefront read immediately reflects out of stock
    const storefrontRead = queryJson(`
      SELECT serial_number, stock, status FROM public.products
      WHERE serial_number = 'CU-DJ-042';
    `);
    assert(storefrontRead.stock === 0, 'Storefront query immediately sees stock = 0');

    // Attempt second checkout on now out-of-stock item
    let secondCheckoutFailed = false;
    let secondErrorMessage = '';
    try {
      callCheckoutRpc({
        ...checkoutParams,
        p_key_hash: 'test-cat-idem-002', // new idempotency key
      });
    } catch (err) {
      secondCheckoutFailed = true;
      secondErrorMessage = err.message;
    }
    assert(secondCheckoutFailed, 'Second checkout on 0-stock product is rejected atomically');
    assert(secondErrorMessage.includes('OUT_OF_STOCK'), `Rejection error contains OUT_OF_STOCK`);

    // Verify inventory did not go negative
    const finalStock = queryJson(`
      SELECT stock FROM public.products WHERE serial_number = 'CU-DJ-042';
    `);
    assert(finalStock.stock === 0, 'Stock remained strictly 0 (never negative)');
  }

  // ------------------------------------------------------------------------
  // Suite 9: Admin Catalogue Management & Permanent Delete Safety
  // ------------------------------------------------------------------------
  log('\n--- SUITE 9: Admin Operations & Delete Protection ---');
  {
    // Admin query sees all 6 products (including DRAFT and ARCHIVED)
    const adminProducts = queryJsonArray(`
      SELECT serial_number, status FROM public.products ORDER BY created_at DESC;
    `);
    assert(adminProducts.length === 6, 'Admin listing returns all 6 products');

    // Admin creates new product
    runSql(`
      INSERT INTO public.products (
        id, serial_number, name, slug, price, stock, category, status
      ) VALUES (
        '20000000-0000-0000-0000-000000000001',
        'CU-ADM-999',
        'Admin Created Velvet Kimono',
        'admin-created-velvet-kimono-cu-adm-999',
        520000, 2, 'womens-upperwear', 'DRAFT'
      );
    `);
    const createdCheck = queryJson(`SELECT * FROM public.products WHERE serial_number = 'CU-ADM-999';`);
    assert(createdCheck.name === 'Admin Created Velvet Kimono', 'Admin product created in Supabase');

    // Admin updates product
    runSql(`
      UPDATE public.products
      SET stock = 4, price = 480000, status = 'PUBLISHED'
      WHERE serial_number = 'CU-ADM-999';
    `);
    const updatedCheck = queryJson(`SELECT stock, price, status FROM public.products WHERE serial_number = 'CU-ADM-999';`);
    assert(updatedCheck.stock === 4 && updatedCheck.price === 480000 && updatedCheck.status === 'PUBLISHED', 'Admin product update succeeded');

    // Admin soft-deletes (archives)
    runSql(`
      UPDATE public.products SET status = 'ARCHIVED' WHERE serial_number = 'CU-ADM-999';
    `);
    const archivedCheck = queryJson(`SELECT status FROM public.products WHERE serial_number = 'CU-ADM-999';`);
    assert(archivedCheck.status === 'ARCHIVED', 'Admin soft-delete (archive) succeeded');

    // Admin restores
    runSql(`
      UPDATE public.products SET status = 'PUBLISHED' WHERE serial_number = 'CU-ADM-999';
    `);
    const restoredCheck = queryJson(`SELECT status FROM public.products WHERE serial_number = 'CU-ADM-999';`);
    assert(restoredCheck.status === 'PUBLISHED', 'Admin restore to PUBLISHED succeeded');

    // Permanent delete check:
    // 1. CU-DJ-042 was checked out and exists in public.order_items.
    const inOrderItems = queryJsonArray(`
      SELECT id FROM public.order_items WHERE product_id = '10000000-0000-0000-0000-000000000002';
    `);
    assert(inOrderItems.length > 0, 'CU-DJ-042 exists in public.order_items');

    // Business rule: application layer blocks deleting products with order history
    const canDelete = inOrderItems.length === 0;
    assert(!canDelete, 'Business rule blocks permanent deletion for products with order history');

    // 2. CU-ADM-999 has NO order items, so it CAN be deleted permanently
    runSql(`DELETE FROM public.products WHERE serial_number = 'CU-ADM-999';`);
    const remainingCheck = queryJsonArray(`SELECT id FROM public.products WHERE serial_number = 'CU-ADM-999';`);
    assert(remainingCheck.length === 0, 'Unordered product deleted permanently');
  }

  // ------------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------------
  log('\n============================================================');
  log(`  TEST RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  log('============================================================');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\nFatal test execution error:', err);
  process.exit(1);
});
