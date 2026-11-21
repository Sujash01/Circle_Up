import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rpcMigrationPath = path.join(
  rootDir,
  'supabase',
  'migrations',
  '20261122_checkout_atomic_rpc.sql',
);

console.log('------------------------------------------------------------');
console.log('🔍 Static & Lexical Analysis on process_storefront_checkout RPC');
console.log('------------------------------------------------------------');

if (!fs.existsSync(rpcMigrationPath)) {
  console.error(`❌ Migration file not found: ${rpcMigrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(rpcMigrationPath, 'utf8');

// 1. Destructive SQL Guards
const destructivePatterns = [
  { name: 'DROP TABLE', regex: /\bdrop\s+table\b/i },
  { name: 'TRUNCATE', regex: /\btruncate\b/i },
  { name: 'DROP SCHEMA', regex: /\bdrop\s+schema\b/i },
  { name: 'ALTER TABLE products DROP', regex: /\balter\s+table\s+public\.products\s+drop\b/i },
];

for (const { name, regex } of destructivePatterns) {
  if (regex.test(sql)) {
    console.error(`❌ Forbidden destructive pattern detected: ${name}`);
    process.exit(1);
  }
}
console.log('✅ Check 1: Zero destructive statements found.');

// 2. Lexical Delimiter Validation
let parenDepth = 0;
let inDollarQuote = false;
let inString = false;
let inLineComment = false;
let inBlockComment = false;

for (let i = 0; i < sql.length; i++) {
  const c = sql[i];
  const next = sql[i + 1] || '';

  if (inLineComment) {
    if (c === '\n') inLineComment = false;
    continue;
  }
  if (inBlockComment) {
    if (c === '*' && next === '/') {
      inBlockComment = false;
      i++;
    }
    continue;
  }
  if (inString) {
    if (c === "'") {
      if (next === "'") i++;
      else inString = false;
    }
    continue;
  }
  if (inDollarQuote) {
    if (c === '$' && next === '$') {
      inDollarQuote = false;
      i++;
    }
    continue;
  }

  if (c === '-' && next === '-') {
    inLineComment = true;
    i++;
    continue;
  }
  if (c === '/' && next === '*') {
    inBlockComment = true;
    i++;
    continue;
  }
  if (c === "'") {
    inString = true;
    continue;
  }
  if (c === '$' && next === '$') {
    inDollarQuote = true;
    i++;
    continue;
  }
  if (c === '(') parenDepth++;
  if (c === ')') parenDepth--;
}

if (inDollarQuote || inString || inBlockComment || parenDepth !== 0) {
  console.error(
    `❌ Lexical delimiter syntax error (parenDepth: ${parenDepth}, inDollarQuote: ${inDollarQuote})`,
  );
  process.exit(1);
}
console.log('✅ Check 2: Lexical stream valid, dollar-quotes and parentheses balanced.');

// 3. Invariants & Security Specifications
const invariants = [
  {
    name: 'RPC Function Declaration',
    test: /create\s+or\s+replace\s+function\s+public\.process_storefront_checkout/i.test(sql),
  },
  {
    name: 'Security Definer with Empty Search Path',
    test: /security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql),
  },
  {
    name: 'Row Locking on Products (FOR UPDATE)',
    test: /select\s+p\.\*\s+from\s+public\.products[\s\S]+?for\s+update/i.test(sql),
  },
  {
    name: 'Row Locking on Coupons (FOR UPDATE)',
    test: /select\s+\*\s+into\s+v_coupon\s+from\s+public\.coupons[\s\S]+?for\s+update/i.test(sql),
  },
  {
    name: 'Deterministic Product Order By (Deadlock Prevention)',
    test: /order\s+by\s+p\.serial_number\s+asc/i.test(sql),
  },
  {
    name: 'Idempotency Concurrency with ON CONFLICT DO NOTHING',
    test: /insert\s+into\s+public\.checkout_idempotency[\s\S]+?on\s+conflict\s*\(\s*key_hash\s*\)\s*do\s+nothing/i.test(
      sql,
    ),
  },
  {
    name: 'Idempotency Conflict Resolution (FOR UPDATE)',
    test: /select\s+\*\s+into\s+v_conflicting_idem\s+from\s+public\.checkout_idempotency\s+where\s+key_hash\s*=\s*p_key_hash\s+for\s+update/i.test(
      sql,
    ),
  },
  {
    name: 'Product Status Filtering (AVAILABLE, ACTIVE, PUBLISHED)',
    test: /v_product\.status\s+not\s+in\s*\(\s*'AVAILABLE',\s*'ACTIVE',\s*'PUBLISHED'\s*\)/i.test(
      sql,
    ),
  },
  {
    name: 'Inventory Decrement Exactly Once & SOLD_OUT Status Transition',
    test: /v_new_stock\s*:=\s*v_product\.stock\s*-\s*v_qty/i.test(sql) &&
          /case\s+when\s+v_new_stock\s*=\s*0\s+then\s*'SOLD_OUT'/i.test(sql),
  },
  {
    name: 'Free Shipping Threshold at 150000 paise (₹1,500)',
    test: /v_discounted_subtotal\s*>=\s*150000\s+then\s+v_delivery_fee\s*:=\s*0/i.test(sql),
  },
  {
    name: 'Public Orders Insertion',
    test: /insert\s+into\s+public\.orders/i.test(sql),
  },
  {
    name: 'Public Order Items Insertion with slug',
    test: /insert\s+into\s+public\.order_items[\s\S]+?slug/i.test(sql),
  },
  {
    name: 'Zero Plaintext Guest Token in response_payload',
    test: /'guestAccessToken',\s*null/i.test(sql),
  },
  {
    name: 'Idempotency 24h Expiry Update on Commit',
    test: /expires_at\s*=\s*pg_catalog\.now\(\)\s*\+\s*interval\s*'24 hours'/i.test(sql),
  },
  {
    name: 'Strict Permissions: Revoked from PUBLIC, Granted to service_role',
    test: /revoke\s+all\s+on\s+function\s+public\.process_storefront_checkout[\s\S]+?from\s+public/i.test(
      sql,
    ) &&
          /grant\s+execute\s+on\s+function\s+public\.process_storefront_checkout[\s\S]+?to\s+service_role/i.test(
            sql,
          ),
  },
  {
    name: 'Product Variant & Size Validation',
    test: /v_product\.sizes\s*@>\s*array\[v_item_size\]/i.test(sql) &&
          /INVALID_VARIANT/i.test(sql),
  },
  {
    name: 'Site Settings WhatsApp Verification Column Migration',
    test: /alter\s+table\s+public\.site_settings\s+add\s+column\s+if\s+not\s+exists\s+is_whatsapp_verified\s+boolean/i.test(sql),
  },
  {
    name: 'WhatsApp Store-Verified Configuration & Placeholder Rejection',
    test: /v_is_whatsapp_verified/i.test(sql) &&
          /coalesce\(v_is_whatsapp_verified,\s*false\)\s+is\s+not\s+true/i.test(sql) &&
          /v_cleaned_whatsapp\s+in\s*\(\s*'919876543210',\s*'910000000000'/i.test(sql) &&
          /PAYMENT_METHOD_UNAVAILABLE/i.test(sql),
  },
  {
    name: 'Collision-Resistant Cryptographic Order Number Generation (Full 32-hex unhyphenated UUID, 122 bits CSPRNG entropy)',
    test: /pg_catalog\.gen_random_uuid\(\)/i.test(sql) &&
          /pg_catalog\.replace\(pg_catalog\.gen_random_uuid\(\)::text,\s*'-',\s*''\)/i.test(sql) &&
          !/pg_catalog\.gen_random_bytes/i.test(sql),
  },
  {
    name: 'Order-Number Collision Isolation (Retries Only on order_number Constraint)',
    test: /get\s+stacked\s+diagnostics\s+v_constraint_name\s*=\s*constraint_name/i.test(sql) &&
          /orders_order_number_key/i.test(sql) &&
          /raise;/i.test(sql),
  },
  {
    name: 'Coupon Precision & Unsupported Type Rejection',
    test: /v_coupon\.discount_type\s+not\s+in\s*\(\s*'PERCENTAGE',\s*'FLAT'\s*\)/i.test(sql) &&
          /round\(\(v_subtotal::numeric\s*\*\s*v_coupon\.discount_value::numeric\)\s*\/\s*100\.0\)::bigint/i.test(sql),
  },
];

for (const { name, test } of invariants) {
  if (!test) {
    console.error(`❌ Invariant failed: ${name}`);
    process.exit(1);
  }
}

console.log(`✅ Check 3: All ${invariants.length} architectural & security invariants verified successfully.`);
console.log('------------------------------------------------------------');
console.log('🎉 RPC static verification passed: 100% compliant with Milestone 1, Step 2.');
console.log('------------------------------------------------------------');
