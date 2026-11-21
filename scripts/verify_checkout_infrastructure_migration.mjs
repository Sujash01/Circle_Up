import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20261121_checkout_infrastructure.sql');

console.log('------------------------------------------------------------');
console.log('🔍 Structural & Lexical Static Validation on Migration SQL');
console.log('------------------------------------------------------------');

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

// 1. Destructive Patterns Inspection
const destructivePatterns = [
  { name: 'DROP TABLE', regex: /\bdrop\s+table\b/i },
  { name: 'TRUNCATE', regex: /\btruncate\b/i },
  { name: 'DELETE FROM orders', regex: /\bdelete\s+from\s+public\.orders\b/i },
  { name: 'DELETE FROM coupons', regex: /\bdelete\s+from\s+public\.coupons\b/i },
  { name: 'DELETE FROM products', regex: /\bdelete\s+from\s+public\.products\b/i },
  { name: 'DROP COLUMN', regex: /\bdrop\s+column\b/i },
];

for (const { name, regex } of destructivePatterns) {
  if (regex.test(sql)) {
    console.error(`❌ Destructive SQL pattern detected: ${name}`);
    process.exit(1);
  }
}
console.log('✅ Check 1: No destructive operations (DROP TABLE, TRUNCATE, DROP COLUMN, table wipe).');

// 2. Lexical Tokenizer & Statement Extractor
function extractStatements(source) {
  const statements = [];
  let current = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inDollarQuote = false;
  let parenDepth = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1] || '';

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      current += char;
      if (char === "'") {
        if (next === "'") {
          current += next;
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (inDollarQuote) {
      current += char;
      if (char === '$' && next === '$') {
        current += next;
        i++;
        inDollarQuote = false;
      }
      continue;
    }

    // Not in any quoted/comment block
    if (char === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }

    if (char === '$' && next === '$') {
      inDollarQuote = true;
      current += '$$';
      i++;
      continue;
    }

    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;

    if (char === ';' && parenDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += char;
  }

  const remainder = current.trim();
  if (remainder) {
    statements.push(remainder);
  }

  return { statements, inString, inBlockComment, inDollarQuote, parenDepth };
}

const { statements, inString, inBlockComment, inDollarQuote, parenDepth } = extractStatements(sql);

if (inString) {
  console.error('❌ Syntax error: Unterminated single-quoted string literal.');
  process.exit(1);
}
if (inBlockComment) {
  console.error('❌ Syntax error: Unterminated block comment (/* ... */).');
  process.exit(1);
}
if (inDollarQuote) {
  console.error('❌ Syntax error: Unterminated dollar-quoted PL/pgSQL body ($$).');
  process.exit(1);
}
if (parenDepth !== 0) {
  console.error(`❌ Syntax error: Unbalanced parentheses (depth: ${parenDepth}).`);
  process.exit(1);
}
console.log(`✅ Check 2: Lexical token stream valid. Extracted ${statements.length} distinct SQL statements with balanced delimiters.`);

// 3. Schema & Constraint Assertions
const assertions = [
  {
    desc: 'checkout_idempotency created with key_hash unique constraint and default now()',
    test: statements.some(s =>
      /create\s+table\s+if\s+not\s+exists\s+public\.checkout_idempotency/i.test(s) &&
      /key_hash\s+text\s+not\s+null\s+unique/i.test(s) &&
      /created_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i.test(s)
    ),
  },
  {
    desc: 'Redundant key_hash index omitted (relies on UNIQUE constraint index)',
    test: !sql.includes('idx_checkout_idempotency_key_hash'),
  },
  {
    desc: 'checkout_idempotency expires_at index declared for range cleanup',
    test: statements.some(s => /create\s+index\s+if\s+not\s+exists\s+idx_checkout_idempotency_expires_at/i.test(s)),
  },
  {
    desc: 'checkout_idempotency RLS enabled with strict service_role policy (no public/app_metadata leak)',
    test: statements.some(s => /alter\s+table\s+public\.checkout_idempotency\s+enable\s+row\s+level\s+security/i.test(s)) &&
          statements.some(s => /create\s+policy\s+"Service role manages checkout_idempotency"[\s\S]+?to\s+service_role/i.test(s)),
  },
  {
    desc: 'orders: canonical promo_code added, duplicate coupon_code omitted',
    test: /add\s+column\s+if\s+not\s+exists\s+promo_code\s+text/i.test(sql) &&
          !/add\s+column\s+if\s+not\s+exists\s+coupon_code\s+text/i.test(sql),
  },
  {
    desc: 'orders: guest access uses only hash and expires_at (no raw plaintext guest_token)',
    test: /add\s+column\s+if\s+not\s+exists\s+guest_access_token_hash\s+text/i.test(sql) &&
          /add\s+column\s+if\s+not\s+exists\s+guest_access_expires_at\s+timestamptz/i.test(sql) &&
          !/add\s+column\s+if\s+not\s+exists\s+guest_token\s+text/i.test(sql),
  },
  {
    desc: 'order_items: slug column added for product navigation',
    test: /alter\s+table\s+public\.order_items[\s\S]+?add\s+column\s+if\s+not\s+exists\s+slug\s+text/i.test(sql),
  },
  {
    desc: 'coupons: statement sequence drops constraint BEFORE normalizing data, then re-adds canonical constraint',
    test: (() => {
      const dropIdx = statements.findIndex(s => /alter\s+table\s+public\.coupons\s+drop\s+constraint\s+if\s+exists\s+coupons_discount_type_check/i.test(s));
      const updateIdx = statements.findIndex(s => /update\s+public\.coupons\s+set\s+discount_type/i.test(s));
      const addIdx = statements.findIndex(s => /alter\s+table\s+public\.coupons\s+add\s+constraint\s+coupons_discount_type_check/i.test(s));
      return dropIdx !== -1 && updateIdx !== -1 && addIdx !== -1 && dropIdx < updateIdx && updateIdx < addIdx;
    })(),
  },
  {
    desc: 'coupons: data normalization updates legacy FIXED records to canonical FLAT',
    test: /update\s+public\.coupons\s+set\s+discount_type\s*=\s*'FLAT'/i.test(sql),
  },
  {
    desc: 'coupons: constraint enforces canonical FLAT without FIXED or mutating trigger',
    test: /coupons_discount_type_check\s+check\s*\(\s*discount_type\s+in\s*\(\s*'PERCENTAGE',\s*'FLAT',\s*'FREE_SHIPPING',\s*'BOGO'\s*\)\s*\)/i.test(sql) &&
          !/create\s+trigger/i.test(sql),
  },
  {
    desc: 'cleanup_expired_idempotency_keys: enforces empty search_path (set search_path = \'\') and schema qualification',
    test: /set\s+search_path\s*=\s*''/i.test(sql) &&
          /public\.checkout_idempotency/i.test(sql) &&
          /pg_catalog\.now\(\)/i.test(sql),
  },
  {
    desc: 'cleanup_expired_idempotency_keys: revokes execution from PUBLIC and grants to service_role',
    test: /revoke\s+all\s+on\s+function\s+public\.cleanup_expired_idempotency_keys\(\)\s+from\s+public/i.test(sql) &&
          /grant\s+execute\s+on\s+function\s+public\.cleanup_expired_idempotency_keys\(\)\s+to\s+service_role/i.test(sql),
  },
  {
    desc: 'cleanup_expired_idempotency_keys: deletes strictly completed expired records (response_payload is not null)',
    test: /where\s+expires_at\s*<\s*pg_catalog\.now\(\)\s+and\s+response_payload\s+is\s+not\s+null/i.test(sql),
  },
];

for (const assertion of assertions) {
  if (!assertion.test) {
    console.error(`❌ Verification failed: ${assertion.desc}`);
    process.exit(1);
  }
}
console.log(`✅ Check 3: All ${assertions.length} architectural, security, and schema invariants verified successfully.`);

console.log('------------------------------------------------------------');
console.log('🎉 Migration static verification succeeded: 100% compliant with Milestone 1 specifications.');
console.log('------------------------------------------------------------');
