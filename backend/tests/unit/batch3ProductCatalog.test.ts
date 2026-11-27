import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapSupabaseRowToProductItem,
  supabaseCatalogService,
} from '../../src/services/supabaseCatalog.service.js';

function createBaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    serial_number: 'CU-B-101',
    name: 'Structured Blazer',
    slug: 'structured-blazer-101',
    description: 'Vintage wool blazer',
    price: 250000,
    stock: 2,
    category: 'blazers',
    status: 'DRAFT',
    images: ['https://cdn.example.com/1.webp'],
    sizes: ['S', 'M'],
    variants: [
      { id: 'v-s', label: 'S', size: 'S', stock: 1 },
      { id: 'v-m', label: 'M', size: 'M', stock: 1 },
    ],
    measurements_data: { Chest: '38"', Length: '28"' },
    tags: ['vintage'],
    featured: false,
    chest_pick: false,
    is_new_arrival: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('Batch 3: Backend Product Catalog Variants, Status & Duplication', () => {
  it('preserves zero stock on synthesized fallback variant and preserves measurementsData', () => {
    const mapped = mapSupabaseRowToProductItem(
      createBaseRow({
        stock: 0,
        sizes: ['M'],
        variants: [],
      }),
    );

    expect(mapped.stock).toBe(0);
    expect(mapped.variants).toHaveLength(1);
    expect(mapped.variants?.[0].stock).toBe(0);
    expect(mapped.measurementsData).toEqual({ Chest: '38"', Length: '28"' });
    expect(mapped.measurements).toBeUndefined();
  });

  it('updateProduct preserves DRAFT/ARCHIVED status when stock > 0 and syncs stock from variants', async () => {
    const existingRow = createBaseRow({ status: 'DRAFT', stock: 0 });
    let capturedUpdate: Record<string, unknown> | undefined;

    const mockClient = {
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
          update: vi.fn((payload: Record<string, unknown>) => {
            capturedUpdate = payload;
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { ...existingRow, ...payload },
                    error: null,
                  }),
                  single: vi.fn().mockResolvedValue({
                    data: { ...existingRow, ...payload },
                    error: null,
                  }),
                })),
              })),
            };
          }),
        };
        return builder;
      }),
    } as unknown as SupabaseClient;

    const updated = await supabaseCatalogService.updateProduct(
      existingRow.id,
      {
        variants: [
          { id: 'v-s', label: 'S', size: 'S', stock: 0 },
          { id: 'v-m', label: 'M', size: 'M', stock: 3 },
        ],
      },
      mockClient,
    );

    expect(capturedUpdate?.stock).toBe(3);
    expect(capturedUpdate?.status).toBeUndefined();
    expect(updated.status).toBe('DRAFT');
  });

  it('updateProduct reactivates SOLD_OUT to ACTIVE when stock becomes positive', async () => {
    const existingRow = createBaseRow({ status: 'SOLD_OUT', stock: 0 });
    let capturedUpdate: Record<string, unknown> | undefined;

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
        update: vi.fn((payload: Record<string, unknown>) => {
          capturedUpdate = payload;
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...existingRow, ...payload },
                  error: null,
                }),
                single: vi.fn().mockResolvedValue({
                  data: { ...existingRow, ...payload },
                  error: null,
                }),
              })),
            })),
          };
        }),
      })),
    } as unknown as SupabaseClient;

    const updated = await supabaseCatalogService.updateProduct(
      existingRow.id,
      { stock: 2 },
      mockClient,
    );

    expect(capturedUpdate?.status).toBe('ACTIVE');
    expect(updated.status).toBe('ACTIVE');
  });

  it('duplicateProduct copies measurementsData and aligns global stock with duplicated variants', async () => {
    const sourceRow = createBaseRow({
      status: 'ACTIVE',
      stock: 5,
      variants: [
        { id: 'v-s', label: 'S', size: 'S', stock: 3 },
        { id: 'v-m', label: 'M', size: 'M', stock: 2 },
      ],
    });
    let capturedInsert: Record<string, unknown> | undefined;

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: sourceRow, error: null }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          capturedInsert = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { ...sourceRow, ...payload, id: '22222222-2222-4222-8222-222222222222' },
                error: null,
              }),
            })),
          };
        }),
      })),
    } as unknown as SupabaseClient;

    const duplicated = await supabaseCatalogService.duplicateProduct(sourceRow.id, mockClient);

    expect(capturedInsert?.status).toBe('DRAFT');
    expect(capturedInsert?.measurements_data).toEqual({ Chest: '38"', Length: '28"' });
    expect(capturedInsert?.stock).toBe(2);
    expect(duplicated.stock).toBe(2);
    expect(duplicated.measurementsData).toEqual({ Chest: '38"', Length: '28"' });
  });
});
