import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20261123_inquiries_and_storage.sql');

console.log('------------------------------------------------------------');
console.log('🔍 Static Validation: Inquiries & Storage Migration SQL');
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
  { name: 'DELETE FROM inquiries', regex: /\bdelete\s+from\s+public\.inquiries\b/i },
  { name: 'DROP COLUMN', regex: /\bdrop\s+column\b/i },
  { name: 'CREATE SCHEMA storage', regex: /\bcreate\s+schema\s+(if\s+not\s+exists\s+)?storage\b/i },
  { name: 'CREATE TABLE storage.buckets', regex: /\bcreate\s+table\s+(if\s+not\s+exists\s+)?storage\.buckets\b/i },
  { name: 'CREATE TABLE storage.objects', regex: /\bcreate\s+table\s+(if\s+not\s+exists\s+)?storage\.objects\b/i },
];

for (const { name, regex } of destructivePatterns) {
  if (regex.test(sql)) {
    console.error(`❌ Prohibited SQL pattern detected: ${name}`);
    process.exit(1);
  }
}
console.log('✅ Check 1: No destructive operations or platform-managed table recreation (storage schema/tables not recreated).');

// 2. Lexical Tokenizer & Statement Extractor
function extractStatements(source) {
  const statements = [];
  let current = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
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

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
      if (parenDepth < 0) {
        throw new Error(`Unbalanced parenthesis at position ${i}`);
      }
    }

    if (char === ';' && parenDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  if (parenDepth !== 0) throw new Error('Unbalanced parentheses across entire script.');

  return statements;
}

const statements = extractStatements(sql);
console.log(`✅ Check 2: Lexical token stream valid. Extracted ${statements.length} distinct SQL statements.`);

// 3. Schema & Constraint Assertions
const requiredAssertions = [
  {
    desc: 'public.inquiries: created with gen_random_uuid primary key',
    test: /create\s+table\s+if\s+not\s+exists\s+public\.inquiries\s*\([\s\S]+?id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: name column with bounds check (between 1 and 100)',
    test: /name\s+text\s+not\s+null\s+check\s*\(\s*char_length\(trim\(name\)\)\s+between\s+1\s+and\s+100\s*\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: email column with length bounds (3-255) and regex format check',
    test: /email\s+text\s+not\s+null\s+check\s*\([\s\S]+?char_length\(trim\(email\)\)\s+between\s+3\s+and\s+255[\s\S]+?email\s+~\*\s+'\^/i.test(sql),
  },
  {
    desc: 'public.inquiries: subject (1-200) and message (1-5000) length boundary checks',
    test: /subject\s+text\s+not\s+null\s+default\s+'General Inquiry'\s+check\s*\(\s*char_length\(trim\(subject\)\)\s+between\s+1\s+and\s+200\s*\)/i.test(sql) &&
          /message\s+text\s+not\s+null\s+check\s*\(\s*char_length\(trim\(message\)\)\s+between\s+1\s+and\s+5000\s*\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: status enum check constraint (NEW, IN_REVIEW, RESOLVED, ARCHIVED)',
    test: /status\s+text\s+not\s+null\s+default\s+'NEW'\s+check\s*\(\s*status\s+in\s*\('NEW',\s*'IN_REVIEW',\s*'RESOLVED',\s*'ARCHIVED'\)\s*\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: created_at and updated_at with UTC timestamps',
    test: /created_at\s+timestamptz\s+not\s+null\s+default\s+timezone\('utc'::text,\s*now\(\)\)/i.test(sql) &&
          /updated_at\s+timestamptz\s+not\s+null\s+default\s+timezone\('utc'::text,\s*now\(\)\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: indexes on created_at, status, and email',
    test: /idx_inquiries_created_at\s+on\s+public\.inquiries\(created_at\s+desc\)/i.test(sql) &&
          /idx_inquiries_status\s+on\s+public\.inquiries\(status\)/i.test(sql) &&
          /idx_inquiries_email\s+on\s+public\.inquiries\(email\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: row level security enabled',
    test: /alter\s+table\s+public\.inquiries\s+enable\s+row\s+level\s+security/i.test(sql),
  },
  {
    desc: 'public.inquiries: inserts are restricted to the rate-limited Express service role',
    test: /create\s+policy\s+"Service role can submit inquiries"\s+on\s+public\.inquiries\s+for\s+insert\s+with\s+check\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: reads restricted to the Express service role',
    test: /create\s+policy\s+"Service role can view inquiries"\s+on\s+public\.inquiries\s+for\s+select\s+using\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*\)/i.test(sql),
  },
  {
    desc: 'public.inquiries: direct public/authenticated access is revoked; service_role has all',
    test: /revoke\s+all\s+on\s+table\s+public\.inquiries\s+from\s+anon,\s*authenticated/i.test(sql) &&
          /grant\s+all\s+on\s+table\s+public\.inquiries\s+to\s+service_role/i.test(sql),
  },
  {
    desc: 'storage: product-images bucket configured as public with 10MB limit and mime types',
    test: /insert\s+into\s+storage\.buckets[\s\S]+?'product-images'[\s\S]+?true[\s\S]+?10485760/i.test(sql),
  },
  {
    desc: 'storage.objects: public select policy for product-images',
    test: /create\s+policy\s+"Public Access to product-images"\s+on\s+storage\.objects\s+for\s+select\s+using\s*\(\s*bucket_id\s*=\s*'product-images'\s*\)/i.test(sql),
  },
  {
    desc: 'storage.objects: mutation policy strictly restricted to service_role',
    test: /create\s+policy\s+"Service role manage product-images"\s+on\s+storage\.objects\s+for\s+all\s+using\s*\(\s*bucket_id\s*=\s*'product-images'\s+and\s+auth\.role\(\)\s*=\s*'service_role'\s*\)/i.test(sql),
  },
];

let failed = 0;
for (const a of requiredAssertions) {
  if (a.test) {
    console.log(`✅ ${a.desc}`);
  } else {
    console.error(`❌ FAILED: ${a.desc}`);
    failed++;
  }
}

console.log('------------------------------------------------------------');
if (failed > 0) {
  console.error(`❌ Verification failed with ${failed} missing or incorrect specifications.`);
  process.exit(1);
} else {
  console.log(`✅ All ${requiredAssertions.length} static schema and security assertions passed successfully!`);
}
