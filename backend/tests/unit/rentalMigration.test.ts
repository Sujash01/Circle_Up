import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('rental catalogue migration', () => {
  it('creates an additive catalogue table and leaves rental bookings separate', () => {
    const migration = readFileSync(new URL('../../../supabase/migrations/20261127_rental_catalog.sql', import.meta.url), 'utf8');
    expect(migration).toContain('create table if not exists public.rental_catalog_items');
    expect(migration).toContain('rental_price_3_days_paise');
    expect(migration).toContain('rental_price_7_days_paise');
    expect(migration).toContain('rental_price_14_days_paise');
    expect(migration).toContain('security_deposit_paise');
    expect(migration).toContain('is_available');
    expect(migration).not.toMatch(/alter table public\.rental_bookings/i);
  });
});
