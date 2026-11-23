import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../../supabase/migrations/20261123_inquiries_and_storage.sql', import.meta.url), 'utf8').toLowerCase();
const storageService = readFileSync(new URL('../../src/services/storage.service.ts', import.meta.url), 'utf8').toLowerCase();
const mediaController = readFileSync(new URL('../../src/controllers/admin/adminMedia.controller.ts', import.meta.url), 'utf8').toLowerCase();
const productSchema = readFileSync(new URL('../../../supabase/migrations/20261115_create_products_schema.sql', import.meta.url), 'utf8').toLowerCase();
const eventSchema = readFileSync(new URL('../../../supabase/migrations/20261120_admin_crm_full_schema.sql', import.meta.url), 'utf8').toLowerCase();
const rentalSchema = readFileSync(new URL('../../../supabase/migrations/20261127_rental_catalog.sql', import.meta.url), 'utf8').toLowerCase();

describe('Supabase media schema and storage policy', () => {
  it('has public reads and server-only mutations for the existing public image bucket', () => {
    expect(migration).toMatch(/'product-images',[\s\S]+?true,[\s\S]+?10485760/i);
    expect(migration).toMatch(/for select\s+using\s*\(bucket_id\s*=\s*'product-images'\)/i);
    expect(migration).toMatch(/for all[\s\S]+?bucket_id\s*=\s*'product-images'[\s\S]+?auth\.role\(\)\s*=\s*'service_role'/i);
  });

  it('keeps image references in existing product, event and rental records', () => {
    expect(productSchema).toContain('images text[] not null');
    expect(eventSchema).toContain('image_url text');
    expect(rentalSchema).toContain('image_url text not null');
  });

  it('uses Supabase Storage without filesystem writes or legacy metadata', () => {
    expect(storageService).toContain("from '../config/supabase.js'");
    expect(storageService).toContain("const bucket = 'product-images'");
    expect(storageService).not.toMatch(/node:fs|writefile|public\/uploads|\/uploads/i);
    expect(mediaController).not.toMatch(/public\/uploads|writefile/i);
  });
});
