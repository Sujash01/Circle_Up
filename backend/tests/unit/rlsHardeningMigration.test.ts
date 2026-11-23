import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RLS & Table Grants Hardening Migration (P0-2, P1-1, P1-2)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20261202000000_harden_rls_and_table_grants.sql',
  );

  it('Migration file exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');

  it('Resolves P0-2: Drops customer direct-insert policy on orders table', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Customers can insert own orders"\s+on\s+public\.orders;/i);
    expect(sql).toMatch(/revoke\s+insert\s+on\s+public\.orders\s+from\s+anon,\s*authenticated;/i);
  });

  it('Resolves P0-2: Drops customer direct-insert policy on order_items table', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Customers can insert own order items"\s+on\s+public\.order_items;/i);
    expect(sql).toMatch(/revoke\s+insert\s+on\s+public\.order_items\s+from\s+anon,\s*authenticated;/i);
  });

  it('Resolves P1-1: Drops public read policy on coupons table and revokes select from anon', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Public can read active coupons"\s+on\s+public\.coupons;/i);
    expect(sql).toMatch(/revoke\s+select\s+on\s+public\.coupons\s+from\s+anon;/i);
  });

  it('Resolves P1-2: Recreates audit log policy strictly bound to service_role and revokes user mutations', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Service role can insert audit logs"\s+on\s+public\.activity_audit_logs;/i);
    expect(sql).toMatch(/auth\.role\(\)\s*=\s*'service_role'/i);
    expect(sql).toMatch(/revoke\s+insert,\s*update,\s*delete\s+on\s+public\.activity_audit_logs\s+from\s+anon,\s*authenticated;/i);
    expect(sql).toMatch(/grant\s+all\s+on\s+public\.activity_audit_logs\s+to\s+service_role;/i);
  });
});
