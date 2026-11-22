import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20261129_product_catalog_delete.sql');

describe('product catalogue SQL migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('locks products and checks order history before deletion', () => {
    expect(sql).toMatch(/from\s+public\.products[\s\S]+?for\s+update/i);
    expect(sql).toMatch(/from\s+public\.order_items[\s\S]+?product_id\s*=\s*p_product_id/i);
    expect(sql).toMatch(/delete\s+from\s+public\.products/i);
  });

  it('keeps execution restricted to the backend service role', () => {
    expect(sql).toMatch(/security\s+invoker/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute[\s\S]+to\s+service_role/i);
  });

  it('does not create or alter product tables or columns', () => {
    expect(sql).not.toMatch(/create\s+table|alter\s+table|drop\s+table|truncate/i);
  });
});
