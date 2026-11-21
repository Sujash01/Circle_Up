import { describe, it, expect, vi } from 'vitest';
import {
  mapSupabaseRowToProductItem,
  supabaseCatalogService,
  PUBLIC_STOREFRONT_STATUSES,
} from '../../src/services/supabaseCatalog.service.js';
import { NotFoundError, BadRequestError } from '../../src/errors/AppError.js';

describe('Supabase Catalog Service - Unit Tests', () => {
  describe('mapSupabaseRowToProductItem', () => {
    it('correctly maps full snake_case row to camelCase IProductItem without data loss', () => {
      const rawRow = {
        id: '11111111-2222-3333-4444-555555555555',
        serial_number: 'CU-DJ-042',
        name: 'Vintage Denim Jacket',
        slug: 'vintage-denim-jacket-cu-dj-042',
        description: 'Classic 90s vintage washed denim jacket',
        price: 349900, // in paise
        original_price: 499900,
        compare_at_price: 399900,
        stock: 3,
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        sizes: ['M', 'L'],
        variants: [{ id: 'v1', label: 'Medium', size: 'M', stock: 1, priceOverride: 349900 }],
        category: 'mens-upperwear',
        category_label: "Men's Upperwear",
        category_code: 'DJ',
        size_category: 'mens-blazer',
        subcategory: 'Denim',
        product_type: 'Pre-Loved',
        condition: 'Gently Used',
        gender: 'Men',
        measurements: 'Chest 42 in, Length 26 in',
        measurements_data: { chest: '42', length: '26' },
        maker_note: 'Hand-inspected vintage denim',
        tags: ['vintage', 'denim', '90s'],
        featured: true,
        is_new_arrival: true,
        chest_pick: true,
        badge: 'Rare Find',
        sku: 'SKU-DJ-042',
        seo_title: 'Rare Vintage Denim Jacket | CircleUp',
        seo_description: 'Authentic 90s washed denim jacket.',
        status: 'AVAILABLE',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T12:00:00.000Z',
      };

      const mapped = mapSupabaseRowToProductItem(rawRow);

      expect(mapped.id).toBe('11111111-2222-3333-4444-555555555555');
      expect(mapped._id).toBe('11111111-2222-3333-4444-555555555555');
      expect(mapped.serialNumber).toBe('CU-DJ-042');
      expect(mapped.categoryCode).toBe('DJ');
      expect(mapped.sizeCategory).toBe('mens-blazer');
      expect(mapped.measurements).toBe('Chest 42 in, Length 26 in');
      expect(mapped.name).toBe('Vintage Denim Jacket');
      expect(mapped.slug).toBe('vintage-denim-jacket-cu-dj-042');
      expect(mapped.price).toBe(349900);
      expect(mapped.originalPrice).toBe(499900);
      expect(mapped.compareAtPrice).toBe(399900);
      expect(mapped.stock).toBe(3);
      expect(mapped.images).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
      expect(mapped.sizes).toEqual(['M', 'L']);
      expect(mapped.category).toBe('mens-upperwear');
      expect(mapped.categoryLabel).toBe("Men's Upperwear");
      expect(mapped.condition).toBe('Gently Used');
      expect(mapped.gender).toBe('Men');
      expect(mapped.badge).toBe('Rare Find');
      expect(mapped.featured).toBe(true);
      expect(mapped.chestPick).toBe(true);
      expect(mapped.isNewArrival).toBe(true);
      expect(mapped.status).toBe('AVAILABLE');
      expect(mapped.createdAt).toBe('2026-11-20T10:00:00.000Z');
      expect(mapped.updatedAt).toBe('2026-11-20T12:00:00.000Z');
    });

    it('extracts categoryCode from serialNumber if category_code column is missing', () => {
      const row = {
        id: '22222222-3333-4444-5555-666666666666',
        serial_number: 'CU-WB-J-009',
        name: 'Wide Leg Jeans',
        price: 250000,
        stock: 1,
      };

      const mapped = mapSupabaseRowToProductItem(row);
      expect(mapped.categoryCode).toBe('WB-J');
      expect(mapped.status).toBe('AVAILABLE');
    });

    it('defaults status to SOLD_OUT when stock is 0 and status is missing', () => {
      const row = {
        id: '33333333-4444-5555-6666-777777777777',
        serial_number: 'CU-SET-001',
        name: 'Co-ord Set',
        price: 150000,
        stock: 0,
      };

      const mapped = mapSupabaseRowToProductItem(row);
      expect(mapped.stock).toBe(0);
      expect(mapped.status).toBe('SOLD_OUT');
    });
  });

  describe('supabaseCatalogService.listProducts', () => {
    it('applies visibility filtering to include public storefront statuses only', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockIn = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'aaa-111',
            serial_number: 'CU-001',
            name: 'Dress 1',
            price: 200000,
            stock: 2,
            status: 'PUBLISHED',
          },
        ],
        error: null,
        count: 1,
      });

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: mockSelect,
          in: mockIn,
          order: mockOrder,
          range: mockRange,
        }),
      } as any;

      const result = await supabaseCatalogService.listProducts({ page: 1, limit: 10 }, mockClient);

      expect(mockClient.from).toHaveBeenCalledWith('products');
      expect(mockIn).toHaveBeenCalledWith('status', PUBLIC_STOREFRONT_STATUSES);
      expect(result.products).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it('applies search across name, serial_number, description, and subcategory using or()', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockIn = vi.fn().mockReturnThis();
      const mockOr = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: mockSelect,
          in: mockIn,
          or: mockOr,
          order: mockOrder,
          range: mockRange,
        }),
      } as any;

      await supabaseCatalogService.listProducts({ search: 'vintage velvet' }, mockClient);

      expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('name.ilike.%vintage velvet%'));
      expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('description.ilike.%vintage velvet%'));
      expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('subcategory.ilike.%vintage velvet%'));
      expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('serial_number.ilike.%vintage velvet%'));
    });
  });

  describe('supabaseCatalogService.getProductByIdentifier', () => {
    it('returns product when found with active status', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: [
          {
            id: '44444444-5555-6666-7777-888888888888',
            serial_number: 'CU-SET-100',
            name: 'Floral Co-ord',
            slug: 'floral-co-ord-cu-set-100',
            price: 180000,
            stock: 1,
            status: 'ACTIVE',
          },
        ],
        error: null,
      });

      const mockOr = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ or: mockOr });
      const mockClient = {
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      } as any;

      const product = await supabaseCatalogService.getProductByIdentifier('CU-SET-100', mockClient);

      expect(product.serialNumber).toBe('CU-SET-100');
      expect(product.status).toBe('ACTIVE');
    });

    it('throws NotFoundError when product has an internal hidden status (e.g. DRAFT)', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: [
          {
            id: '55555555-6666-7777-8888-999999999999',
            serial_number: 'CU-DRAFT-01',
            name: 'Unpublished Item',
            price: 180000,
            stock: 1,
            status: 'DRAFT',
          },
        ],
        error: null,
      });

      const mockOr = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ or: mockOr });
      const mockClient = {
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      } as any;

      await expect(
        supabaseCatalogService.getProductByIdentifier('CU-DRAFT-01', mockClient)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when database returns empty array', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockOr = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ or: mockOr });
      const mockClient = {
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      } as any;

      await expect(
        supabaseCatalogService.getProductByIdentifier('NONEXISTENT', mockClient)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('supabaseCatalogService.getRelatedProducts', () => {
    it('queries products in the same category excluding the current product', async () => {
      const mockTarget = {
        id: '66666666-7777-8888-9999-000000000000',
        serialNumber: 'CU-ACC-01',
        category: 'accessories',
        status: 'PUBLISHED',
      };

      vi.spyOn(supabaseCatalogService, 'getProductByIdentifier').mockResolvedValue(mockTarget as any);

      const mockLimit = vi.fn().mockResolvedValue({
        data: [
          {
            id: '77777777-8888-9999-0000-111111111111',
            serial_number: 'CU-ACC-02',
            name: 'Leather Bag',
            category: 'accessories',
            price: 250000,
            stock: 1,
            status: 'PUBLISHED',
          },
        ],
        error: null,
      });

      const mockFallbackLimit = vi.fn().mockResolvedValue({ data: [] });
      const mockFallbackOrder = vi.fn().mockReturnValue({ limit: mockFallbackLimit });
      const mockFallbackIn = vi.fn().mockReturnValue({ order: mockFallbackOrder });
      const mockNot = vi.fn().mockReturnValue({ in: mockFallbackIn });

      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockIn = vi.fn().mockReturnValue({ order: mockOrder });
      const mockNeq = vi.fn().mockReturnValue({ in: mockIn });
      const mockEq = vi.fn().mockReturnValue({ neq: mockNeq });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, not: mockNot });

      const mockClient = {
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      } as any;

      const related = await supabaseCatalogService.getRelatedProducts('CU-ACC-01', 4, mockClient);

      expect(mockEq).toHaveBeenCalledWith('category', 'accessories');
      expect(mockNeq).toHaveBeenCalledWith('id', '66666666-7777-8888-9999-000000000000');
      expect(related).toHaveLength(1);
      expect(related[0].serialNumber).toBe('CU-ACC-02');
    });
  });

  describe('Admin Operations', () => {
    it('createProduct validates price and inserts product', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: '88888888-9999-0000-1111-222222222222',
          serial_number: 'CU-099',
          name: 'New Product',
          slug: 'new-product-cu-099',
          price: 199900,
          stock: 5,
          status: 'PUBLISHED',
        },
        error: null,
      });

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: mockSingle }),
      });

      const mockClient = {
        from: vi.fn().mockReturnValue({
          insert: mockInsert,
          select: vi.fn().mockReturnValue({ count: 10 }),
        }),
      } as any;

      const result = await supabaseCatalogService.createProduct(
        {
          name: 'New Product',
          price: 199900,
          serialNumber: 'CU-099',
          stock: 5,
        },
        mockClient
      );

      expect(result.serialNumber).toBe('CU-099');
      expect(result.price).toBe(199900);
      expect(result.stock).toBe(5);
    });

    it('rejects negative or missing prices on creation', async () => {
      const mockClient = {} as any;

      await expect(
        supabaseCatalogService.createProduct({ name: 'Invalid', price: -50 }, mockClient)
      ).rejects.toThrow(BadRequestError);

      await expect(
        supabaseCatalogService.createProduct({ name: '', price: 1000 }, mockClient)
      ).rejects.toThrow(BadRequestError);
    });

    it('permanentDeleteProduct blocks deletion if product is in order_items', async () => {
      vi.spyOn(supabaseCatalogService, 'getProductByIdentifier').mockResolvedValue({
        id: '99999999-0000-1111-2222-333333333333',
        serialNumber: 'CU-ORDERED-01',
      } as any);

      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'oi-123', order_id: 'ord-456' },
        error: null,
      });

      const mockClient = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'order_items') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      await expect(
        supabaseCatalogService.permanentDeleteProduct('CU-ORDERED-01', mockClient)
      ).rejects.toThrow(BadRequestError);
    });
  });
});
