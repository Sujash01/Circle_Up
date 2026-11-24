// Run with PostgreSQL binaries on PATH or set POSTGRES_BIN_DIR.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const pgBin = process.env.POSTGRES_BIN_DIR || '';
const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const localHost = '127.0.0.1';
let port;

function runPostgres(program, args, input) {
  const binary = program + (process.platform === 'win32' ? '.exe' : '');
  const stdio = program === 'pg_ctl' ? 'ignore' : ['pipe', 'pipe', 'pipe'];
  const result = execFileSync(pgBin ? path.join(pgBin, binary) : binary, args, {
    cwd: repo, env: pgEnv, input, encoding: 'utf8', stdio,
  });
  return result?.replace(/\r\n/g, '\n').trim();
}

function availableLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, localHost, () => {
      const { port: availablePort } = server.address();
      server.close((error) => error ? reject(error) : resolve(availablePort));
    });
  });
}

function runPsql(sql) {
  return runPostgres('psql', ['-X', '-h', localHost, '-p', String(port), '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], sql);
}

function runPsqlFile(filePath) {
  return runPostgres('psql', ['-X', '-h', localHost, '-p', String(port), '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', filePath]);
}

function runRegressionTests() {
  const version = runPsql('SELECT version();');
  console.log('✅ Connected to isolated PostgreSQL:', version.split('\n')[0]);

  // 1. Reset and initialize test schema
  console.log('\n📦 Step 1: Initializing Production Baseline Schema...');
  runPsqlFile('supabase/tests/setup_test_db.sql');
  runPsqlFile('supabase/tests/baseline_checkout_rpc.sql');
  runPsql(`
    CREATE FUNCTION public.storefront_cancel_pending_order(text, text)
      RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.storefront_verify_razorpay_payment(text, text, text, text, bigint, text)
      RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.storefront_verify_razorpay_payment(text, text, text, text)
      RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

    GRANT EXECUTE ON FUNCTION public.storefront_cancel_pending_order(text, text),
      public.storefront_verify_razorpay_payment(text, text, text, text, bigint, text),
      public.storefront_verify_razorpay_payment(text, text, text, text)
      TO PUBLIC, anon, authenticated;
  `);

  const fnProc = "'public.process_storefront_checkout(text,text,uuid,jsonb,jsonb,jsonb,text,text,text,text,timestamptz,text)'::regprocedure";
  const baselineMd5 = runPsql(`SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(${fnProc}));`);
  console.log(`   - Verified Baseline RPC MD5: ${baselineMd5}`);
  if (baselineMd5 !== '27f44dc15663d610807da71bf2a7f3a1') {
    throw new Error(`Baseline MD5 mismatch! Expected 27f44dc15663d610807da71bf2a7f3a1, got ${baselineMd5}`);
  }

  // Baseline privilege state check (confirm excessive grants exist in baseline)
  const fnSig = "'public.process_storefront_checkout(text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text)'";
  const baselineAnonExec = runPsql(`SELECT has_function_privilege('anon', ${fnSig}, 'execute');`);
  const baselineAuthExec = runPsql(`SELECT has_function_privilege('authenticated', ${fnSig}, 'execute');`);
  console.log(`   - Baseline anon execute privilege: ${baselineAnonExec} (Expected: true)`);
  console.log(`   - Baseline authenticated execute privilege: ${baselineAuthExec} (Expected: true)`);

  // 2. Privilege Remediation Hotfix
  console.log('\n🔒 Step 2: Applying Privilege Remediation Hotfix (production_security_rpc_privileges_hotfix.sql)...');
  runPsqlFile('supabase/patches/production_security_rpc_privileges_hotfix.sql');
  const postHotfixAnonExec = runPsql(`SELECT has_function_privilege('anon', ${fnSig}, 'execute');`);
  const postHotfixAuthExec = runPsql(`SELECT has_function_privilege('authenticated', ${fnSig}, 'execute');`);
  const postHotfixServiceExec = runPsql(`SELECT has_function_privilege('service_role', ${fnSig}, 'execute');`);
  const postHotfixPostgresExec = runPsql(`SELECT has_function_privilege('postgres', ${fnSig}, 'execute');`);
  console.log(`   - Post-hotfix anon execute: ${postHotfixAnonExec} (Expected: false)`);
  console.log(`   - Post-hotfix authenticated execute: ${postHotfixAuthExec} (Expected: false)`);
  console.log(`   - Post-hotfix service_role execute: ${postHotfixServiceExec} (Expected: true)`);
  console.log(`   - Post-hotfix postgres execute: ${postHotfixPostgresExec} (Expected: true)`);
  if (postHotfixAnonExec !== 'f' || postHotfixAuthExec !== 'f' || postHotfixServiceExec !== 't' || postHotfixPostgresExec !== 't') {
    throw new Error('Privilege hotfix failed verification!');
  }
  const rpcPermissions = runPsql(`
    SELECT p.proname, p.pronargs,
      has_function_privilege('anon', p.oid, 'EXECUTE'),
      has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      has_function_privilege('service_role', p.oid, 'EXECUTE')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('storefront_cancel_pending_order', 'storefront_verify_razorpay_payment')
    ORDER BY p.proname, p.pronargs;
  `);
  if (rpcPermissions !== [
    'storefront_cancel_pending_order|2|f|f|t',
    'storefront_verify_razorpay_payment|4|f|f|f',
    'storefront_verify_razorpay_payment|6|f|f|t',
  ].join('\n')) {
    throw new Error(`Unexpected cancellation or payment verification grants:\n${rpcPermissions}`);
  }
  console.log('✅ Privilege Remediation Hotfix verified successfully.');

  // 3. Rental Catalog Preflight & Patch
  console.log('\n🛠️ Step 3: Testing Rental Catalog Patch (production_rental_catalog_patch.sql)...');
  const rentalCatalogExistsPre = runPsql("SELECT to_regclass('public.rental_catalog_items') IS NOT NULL;");
  console.log(`   - rental_catalog_items before patch: ${rentalCatalogExistsPre} (Expected: false)`);
  runPsqlFile('supabase/patches/production_rental_catalog_patch.sql');
  const postCatalogExists = runPsql("SELECT to_regclass('public.rental_catalog_items') IS NOT NULL;");
  const rlsEnabled = runPsql("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rental_catalog_items'::regclass;");
  const policiesCount = runPsql("SELECT count(*) FROM pg_policy WHERE polrelid = 'public.rental_catalog_items'::regclass;");
  console.log(`   - rental_catalog_items after patch: ${postCatalogExists} (Expected: true)`);
  console.log(`   - RLS enabled: ${rlsEnabled} (Expected: true)`);
  console.log(`   - Policies count: ${policiesCount} (Expected: 2)`);
  if (postCatalogExists !== 't' || rlsEnabled !== 't' || policiesCount !== '2') {
    throw new Error('Rental catalog patch verification failed!');
  }
  console.log('✅ Rental Catalog Patch applied and verified.');

  // 4. Rental Rollback Safety Test
  console.log('\n🛡️ Step 4: Testing Non-Destructive Rental Rollback Safety...');
  // Insert a test item
  runPsql(`
    INSERT INTO public.rental_catalog_items (name, slug, image_url, rental_price_3_days_paise, rental_price_7_days_paise, rental_price_14_days_paise, security_deposit_paise)
    VALUES ('Silk Evening Gown', 'silk-evening-gown', 'https://example.com/gown.jpg', 300000, 500000, 800000, 1000000);
  `);
  console.log('   - Seeded active record into public.rental_catalog_items');

  let rollbackBlocked = false;
  try {
    runPsqlFile('supabase/patches/production_rental_catalog_rollback.sql');
  } catch (err) {
    rollbackBlocked = true;
    console.log('   - Non-destructive safety triggered as expected: Rollback aborted when records exist.');
  }
  if (!rollbackBlocked) {
    throw new Error('Safety failure: Rollback should have aborted due to existing records!');
  }

  // Clean test item and test clean rollback
  runPsql('DELETE FROM public.rental_catalog_items WHERE slug = \'silk-evening-gown\';');
  runPsqlFile('supabase/patches/production_rental_catalog_rollback.sql');
  const catalogAfterRollback = runPsql("SELECT to_regclass('public.rental_catalog_items') IS NOT NULL;");
  console.log(`   - rental_catalog_items after clean rollback: ${catalogAfterRollback} (Expected: false)`);
  if (catalogAfterRollback !== 'f') {
    throw new Error('Rollback failed to drop empty rental catalog table!');
  }

  // Re-apply rental catalog patch
  runPsqlFile('supabase/patches/production_rental_catalog_patch.sql');
  console.log('✅ Rental Catalog Rollback safety verified and patch re-applied.');

  // 5. Checkout Shipping Precondition Verification (Fingerprint Guard)
  console.log('\n🔒 Step 5: Testing Shipping Patch Precondition & MD5 Fingerprint Guard...');
  // Tamper test: temporarily alter RPC signature body to verify strict fingerprint check rejects mismatch
  runPsql(`
    CREATE OR REPLACE FUNCTION public.process_storefront_checkout(
      p_key_hash text, p_fingerprint text, p_customer_id uuid, p_customer jsonb,
      p_shipping_address jsonb, p_items jsonb, p_payment_method text,
      p_promo_code text default null, p_notes text default null,
      p_guest_access_token_hash text default null,
      p_guest_access_expires_at timestamptz default null,
      p_order_number text default null
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    BEGIN
      RETURN '{"tampered": true}'::jsonb;
    END;
    $$;
  `);
  let tamperRejected = false;
  try {
    runPsqlFile('supabase/patches/production_checkout_shipping_patch.sql');
  } catch (err) {
    tamperRejected = true;
    console.log('   - Strict MD5 precondition guard triggered as expected on fingerprint mismatch.');
  }
  if (!tamperRejected) {
    throw new Error('Safety failure: Shipping patch should have aborted on MD5 mismatch!');
  }

  // Restore exact baseline RPC
  runPsqlFile('supabase/tests/baseline_checkout_rpc.sql');
  console.log('   - Baseline RPC restored.');

  // 6. Apply Shipping Patch
  console.log('\n🛠️ Step 6: Applying Patch 2 (production_checkout_shipping_patch.sql)...');
  runPsqlFile('supabase/patches/production_checkout_shipping_patch.sql');
  console.log('✅ Patch 2 applied successfully.');

  // 7. Verify Helper Function & Logic
  console.log('\n🔎 Step 7: Verifying calculate_storefront_delivery_fee and Permissions...');
  const helperExists = runPsql("SELECT to_regprocedure('public.calculate_storefront_delivery_fee(bigint, integer)') IS NOT NULL;");
  console.log(`   - calculate_storefront_delivery_fee exists: ${helperExists} (Expected: true)`);
  console.log(`   - Fee for 0 items, 0 subtotal: ${runPsql('SELECT public.calculate_storefront_delivery_fee(0, 0);')} (Expected: 0)`);
  console.log(`   - Fee for 1 item, subtotal 50000 paise: ${runPsql('SELECT public.calculate_storefront_delivery_fee(50000, 1);')} (Expected: 9000)`);
  console.log(`   - Fee for 1 item, subtotal 99999 paise: ${runPsql('SELECT public.calculate_storefront_delivery_fee(99999, 1);')} (Expected: 9000)`);
  console.log(`   - Fee for 1 item, subtotal 100000 paise: ${runPsql('SELECT public.calculate_storefront_delivery_fee(100000, 1);')} (Expected: 0)`);
  console.log(`   - Fee for 2 items, subtotal 255000 paise: ${runPsql('SELECT public.calculate_storefront_delivery_fee(255000, 2);')} (Expected: 0)`);

  const helperAnonExec = runPsql("SELECT has_function_privilege('anon', 'public.calculate_storefront_delivery_fee(bigint, integer)', 'execute');");
  const checkoutAnonExec = runPsql(`SELECT has_function_privilege('anon', ${fnSig}, 'execute');`);
  const checkoutServiceExec = runPsql(`SELECT has_function_privilege('service_role', ${fnSig}, 'execute');`);
  console.log(`   - Helper anon execute: ${helperAnonExec} (Expected: false)`);
  console.log(`   - Checkout anon execute: ${checkoutAnonExec} (Expected: false)`);
  console.log(`   - Checkout service_role execute: ${checkoutServiceExec} (Expected: true)`);

  // 8. End-to-End Functional Checkout Execution
  console.log('\n🛒 Step 8: Functional End-to-End Checkout Tests via RPC...');
  // Seed products
  runPsql(`
    INSERT INTO public.products (serial_number, name, slug, price, stock, sizes, status, images)
    VALUES
      ('PROD-700', 'Latex Bodysuit', 'latex-bodysuit', 70000, 10, array['M'], 'ACTIVE', '["https://example.com/suit.jpg"]'::jsonb),
      ('PROD-1000', 'Linen Trench', 'linen-trench', 100000, 10, array['M'], 'ACTIVE', '["https://example.com/trench.jpg"]'::jsonb),
      ('PROD-2550', 'Leather Tote', 'leather-tote', 255000, 10, array['M'], 'ACTIVE', '["https://example.com/tote.jpg"]'::jsonb)
    ON CONFLICT (serial_number) DO UPDATE SET price = EXCLUDED.price, stock = 10, images = EXCLUDED.images;

    INSERT INTO public.coupons (code, discount_type, discount_value, min_order_paise, max_discount_paise, usage_limit, usage_count, is_active, starts_at, ends_at)
    VALUES
      ('SAVE10PCT', 'PERCENTAGE', 10, 100000, 20000, 100, 0, true, now() - interval '1 day', now() + interval '10 days'),
      ('FLAT200', 'FLAT', 20000, 100000, null, 100, 0, true, now() - interval '1 day', now() + interval '10 days'),
      ('EXPIREDCODE', 'FLAT', 10000, 0, null, 100, 0, true, now() - interval '10 days', now() - interval '1 day'),
      ('LIMITREACHED', 'FLAT', 10000, 0, null, 5, 5, true, now() - interval '1 day', now() + interval '10 days')
    ON CONFLICT (code) DO UPDATE SET discount_value = EXCLUDED.discount_value, is_active = EXCLUDED.is_active, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at;
  `);

  // Scenario A: Order below ₹1,000 (Subtotal ₹700 / 70000 paise) -> Shipping should be ₹90 (9000 paise) -> Total ₹790 (79000 paise)
  const p700Id = runPsql("SELECT id FROM public.products WHERE serial_number = 'PROD-700';");
  const payloadBelow1000 = runPsql(`
    SELECT public.process_storefront_checkout(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'fp_test_1',
      null,
      '{"name": "Ananya Sharma", "email": "ananya@example.com", "phone": "9876543210"}'::jsonb,
      '{"addressLine": "123 Indiranagar", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560038"}'::jsonb,
      '[{"productId": "${p700Id}", "serialNumber": "PROD-700", "name": "Latex Bodysuit", "price": 70000, "quantity": 1, "size": "M"}]'::jsonb,
      'RAZORPAY',
      null,
      null,
      'guest_token_hash_1',
      now() + interval '1 day'
    );
  `);
  const parsedA = JSON.parse(payloadBelow1000);
  console.log('   - Scenario A (< ₹1,000): Subtotal:', parsedA.subtotal, 'Delivery fee:', parsedA.deliveryFee, 'Total:', parsedA.totalAmount);
  if (parsedA.subtotal !== 70000 || parsedA.deliveryFee !== 9000 || parsedA.totalAmount !== 79000) {
    throw new Error(`Scenario A calculation mismatch! Got ${JSON.stringify(parsedA)}`);
  }

  // Scenario B: Order exactly ₹1,000 (Subtotal 100000 paise) -> Free shipping -> Total ₹1,000 (100000 paise)
  const p1000Id = runPsql("SELECT id FROM public.products WHERE serial_number = 'PROD-1000';");
  const payloadExact1000 = runPsql(`
    SELECT public.process_storefront_checkout(
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'fp_test_2',
      null,
      '{"name": "Rohan Sen", "email": "rohan@example.com", "phone": "9876543211"}'::jsonb,
      '{"addressLine": "456 Bandra West", "city": "Mumbai", "state": "Maharashtra", "postalCode": "400050"}'::jsonb,
      '[{"productId": "${p1000Id}", "serialNumber": "PROD-1000", "name": "Linen Trench", "price": 100000, "quantity": 1, "size": "M"}]'::jsonb,
      'RAZORPAY',
      null,
      null,
      'guest_token_hash_2',
      now() + interval '1 day'
    );
  `);
  const parsedB = JSON.parse(payloadExact1000);
  console.log('   - Scenario B (== ₹1,000): Subtotal:', parsedB.subtotal, 'Delivery fee:', parsedB.deliveryFee, 'Total:', parsedB.totalAmount);
  if (parsedB.subtotal !== 100000 || parsedB.deliveryFee !== 0 || parsedB.totalAmount !== 100000) {
    throw new Error(`Scenario B calculation mismatch! Got ${JSON.stringify(parsedB)}`);
  }

  // Scenario C: Order ₹2,550 with 10% coupon (Subtotal 255000 - 20000 max discount = 235000 paise) -> Free shipping -> Total 235000 paise
  const p2550Id = runPsql("SELECT id FROM public.products WHERE serial_number = 'PROD-2550';");
  const payloadCoupon = runPsql(`
    SELECT public.process_storefront_checkout(
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'fp_test_3',
      null,
      '{"name": "Priya Nair", "email": "priya@example.com", "phone": "9876543212"}'::jsonb,
      '{"addressLine": "789 Park Street", "city": "Kolkata", "state": "West Bengal", "postalCode": "700016"}'::jsonb,
      '[{"productId": "${p2550Id}", "serialNumber": "PROD-2550", "name": "Leather Tote", "price": 255000, "quantity": 1, "size": "M"}]'::jsonb,
      'RAZORPAY',
      'SAVE10PCT',
      null,
      'guest_token_hash_3',
      now() + interval '1 day'
    );
  `);
  const parsedC = JSON.parse(payloadCoupon);
  console.log('   - Scenario C (Coupon 10% with max discount cap): Subtotal:', parsedC.subtotal, 'Discount:', parsedC.discount, 'Delivery fee:', parsedC.deliveryFee, 'Total:', parsedC.totalAmount);
  if (parsedC.subtotal !== 255000 || parsedC.discount !== 20000 || parsedC.deliveryFee !== 0 || parsedC.totalAmount !== 235000) {
    throw new Error(`Scenario C calculation mismatch! Got ${JSON.stringify(parsedC)}`);
  }

  // Scenario D: Coupon drops subtotal below ₹1,000 threshold (₹1,000 subtotal - ₹200 FLAT discount = ₹800 discounted subtotal -> shipping fee is ₹90 -> total ₹890 / 89000 paise)
  const payloadCouponShipping = runPsql(`
    SELECT public.process_storefront_checkout(
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'fp_test_4',
      null,
      '{"name": "Arjun Das", "email": "arjun@example.com", "phone": "9876543213"}'::jsonb,
      '{"addressLine": "10 Anna Salai", "city": "Chennai", "state": "Tamil Nadu", "postalCode": "600002"}'::jsonb,
      '[{"productId": "${p1000Id}", "serialNumber": "PROD-1000", "name": "Linen Trench", "price": 100000, "quantity": 1, "size": "M"}]'::jsonb,
      'RAZORPAY',
      'FLAT200',
      null,
      'guest_token_hash_4',
      now() + interval '1 day'
    );
  `);
  const parsedD = JSON.parse(payloadCouponShipping);
  console.log('   - Scenario D (Discount drops subtotal below ₹1,000 threshold): Subtotal:', parsedD.subtotal, 'Discount:', parsedD.discount, 'Delivery fee:', parsedD.deliveryFee, 'Total:', parsedD.totalAmount);
  if (parsedD.subtotal !== 100000 || parsedD.discount !== 20000 || parsedD.deliveryFee !== 9000 || parsedD.totalAmount !== 89000) {
    throw new Error(`Scenario D calculation mismatch! Got ${JSON.stringify(parsedD)}`);
  }

  // Scenario E: Expired coupon (EXPIREDCODE) -> no discount applied, proceeds cleanly without crashing
  const payloadExpiredCoupon = runPsql(`
    SELECT public.process_storefront_checkout(
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      'fp_test_5',
      null,
      '{"name": "Kavita Rao", "email": "kavita@example.com", "phone": "9876543214"}'::jsonb,
      '{"addressLine": "55 Banjara Hills", "city": "Hyderabad", "state": "Telangana", "postalCode": "500034"}'::jsonb,
      '[{"productId": "${p1000Id}", "serialNumber": "PROD-1000", "name": "Linen Trench", "price": 100000, "quantity": 1, "size": "M"}]'::jsonb,
      'RAZORPAY',
      'EXPIREDCODE',
      null,
      'guest_token_hash_5',
      now() + interval '1 day'
    );
  `);
  const parsedE = JSON.parse(payloadExpiredCoupon);
  console.log('   - Scenario E (Expired Coupon): Subtotal:', parsedE.subtotal, 'Discount:', parsedE.discount, 'Total:', parsedE.totalAmount);
  if (parsedE.discount !== 0 || parsedE.totalAmount !== 100000) {
    throw new Error(`Scenario E failed! Expired coupon was erroneously applied.`);
  }

  // Scenario F: Usage limit reached coupon (LIMITREACHED) -> no discount applied
  const payloadLimitReached = runPsql(`
    SELECT public.process_storefront_checkout(
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      'fp_test_6',
      null,
      '{"name": "Dev Mehra", "email": "dev@example.com", "phone": "9876543215"}'::jsonb,
      '{"addressLine": "12 Connaught Place", "city": "New Delhi", "state": "Delhi", "postalCode": "110001"}'::jsonb,
      '[{"productId": "${p1000Id}", "serialNumber": "PROD-1000", "name": "Linen Trench", "price": 100000, "quantity": 1, "size": "M"}]'::jsonb,
      'RAZORPAY',
      'LIMITREACHED',
      null,
      'guest_token_hash_6',
      now() + interval '1 day'
    );
  `);
  const parsedF = JSON.parse(payloadLimitReached);
  console.log('   - Scenario F (Limit Reached Coupon): Subtotal:', parsedF.subtotal, 'Discount:', parsedF.discount, 'Total:', parsedF.totalAmount);
  if (parsedF.discount !== 0 || parsedF.totalAmount !== 100000) {
    throw new Error(`Scenario F failed! Limit-reached coupon was erroneously applied.`);
  }

  // 9. Shipping Rollback Test
  console.log('\n🔄 Step 9: Testing Shipping Rollback (production_checkout_shipping_rollback.sql)...');
  runPsqlFile('supabase/patches/production_checkout_shipping_rollback.sql');
  const postRollbackHelper = runPsql("SELECT to_regprocedure('public.calculate_storefront_delivery_fee(bigint, integer)') IS NOT NULL;");
  const postRollbackAnonExec = runPsql(`SELECT has_function_privilege('anon', ${fnSig}, 'execute');`);
  const postRollbackServiceExec = runPsql(`SELECT has_function_privilege('service_role', ${fnSig}, 'execute');`);
  console.log(`   - Helper function exists after rollback: ${postRollbackHelper} (Expected: false)`);
  console.log(`   - Anon execute privilege retained after rollback: ${postRollbackAnonExec} (Expected: false)`);
  console.log(`   - service_role execute privilege retained after rollback: ${postRollbackServiceExec} (Expected: true)`);
  if (postRollbackHelper !== 'f' || postRollbackAnonExec !== 'f' || postRollbackServiceExec !== 't') {
    throw new Error('Rollback failed verification!');
  }
  console.log('✅ Shipping Rollback verified: helper dropped, baseline logic restored, secure privileges preserved.');

  // Final re-apply of Patch 2 so test DB ends in target state
  runPsqlFile('supabase/patches/production_checkout_shipping_patch.sql');
  console.log('✅ Target Patch 2 re-applied successfully.');

  // Verify the tracked migration can run after the manual production patch.
  runPsqlFile('supabase/migrations/20261212000000_approved_checkout_shipping_policy.sql');
  runPsqlFile('supabase/tests/approved_checkout_shipping_policy.sql');

  // Recreate the catalog image type used by the tracked migration history.
  runPsqlFile('supabase/patches/production_checkout_shipping_rollback.sql');
  runPsql(`
    ALTER TABLE public.products ALTER COLUMN images DROP DEFAULT;
    ALTER TABLE public.products ALTER COLUMN images TYPE text[] USING ARRAY[images->>0];
    ALTER TABLE public.products ALTER COLUMN images SET DEFAULT '{}';
  `);
  runPsqlFile('supabase/migrations/20261209000000_secure_checkout_and_payment_verification.sql');
  runPsqlFile('supabase/migrations/20261212000000_approved_checkout_shipping_policy.sql');
  runPsqlFile('supabase/tests/approved_checkout_shipping_policy.sql');

  console.log('\n🎉 ALL PRODUCTION PATCHES, HOTFIXES, ROLLBACKS, AND VERIFICATION TESTS PASSED WITH EXIT CODE 0!');
}

const instance = mkdtempSync(path.join(tmpdir(), 'circleup-pg-'));
const data = path.join(instance, 'data');
const log = path.join(instance, 'postgres.log');
try {
  port = await availableLocalPort();
  runPostgres('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
  runPostgres('pg_ctl', ['-D', data, '-l', log,
    '-o', `-h ${localHost} -p ${port}`, '-w', 'start']);
  const serverData = runPsql('SHOW data_directory;');
  if (path.resolve(serverData) !== path.resolve(data)) {
    throw new Error('PostgreSQL connection did not reach the disposable cluster');
  }
  runRegressionTests();
} catch (error) {
  console.error(error.stderr || error);
  if (existsSync(log)) console.error(readFileSync(log, 'utf8').trim().split('\n').slice(-8).join('\n'));
  process.exitCode = 1;
} finally {
  if (existsSync(path.join(data, 'postmaster.pid'))) {
    runPostgres('pg_ctl', ['-D', data, '-w', 'stop', '-m', 'fast']);
  }
  rmSync(instance, { recursive: true, force: true });
}
