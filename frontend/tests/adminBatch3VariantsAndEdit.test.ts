import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INVENTORY_CATEGORIES,
  productSchema,
  productVariantSchema,
  resolveSizeChartForCategory,
} from '@circleup/shared';
import { cartService } from '../src/services/cartService';
import type { Product } from '../src/types/storefront';

describe('Batch 3: Size Charts, Variant Schemas & Multi-Variant Cart Limits', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('resolves valid SIZE_CHARTS for men blazer and men pants categories', () => {
    for (const code of ['MS', 'MB-J', 'MB-O', 'MB-L'] as const) {
      const meta = INVENTORY_CATEGORIES[code];
      expect(meta).toBeDefined();
      const chart = resolveSizeChartForCategory(code);
      expect(chart).toBeDefined();
      expect(chart?.rows.length).toBeGreaterThan(0);
    }
  });

  it('accepts zero-stock variants and per-variant measurements in shared schemas', () => {
    const parsedVariant = productVariantSchema.parse({
      id: 'var-custom-30',
      label: '30',
      size: '30',
      stock: 0,
      measurements: { Waist: '30"', Inseam: '31"' },
    });
    expect(parsedVariant.stock).toBe(0);
    expect(parsedVariant.measurements).toEqual({ Waist: '30"', Inseam: '31"' });

    const parsedProduct = productSchema.parse({
      id: 'prod-1',
      serialNumber: 'CU-MS-001',
      name: 'Tailored Wool Trousers',
      slug: 'tailored-wool-trousers',
      description: 'Classic wool trousers',
      price: 185000,
      stock: 1,
      category: 'mens-pants',
      status: 'DRAFT',
      images: ['https://cdn.example.com/trousers.webp'],
      sizes: ['30', '32'],
      variants: [
        parsedVariant,
        { id: 'var-32', label: '32', size: '32', stock: 1, measurements: { Waist: '32"' } },
      ],
      measurementsData: { Waist: '30-32"', Length: '40"' },
    });
    expect(parsedProduct.measurementsData).toEqual({ Waist: '30-32"', Length: '40"' });
  });

  it('enforces total-across-variants product.stock in cartService.addItem', () => {
    const variantS = { id: 'v-s', label: 'S', size: 'S', stock: 2 };
    const variantM = { id: 'v-m', label: 'M', size: 'M', stock: 2 };
    const product: Product = {
      id: 'prod-multi',
      serialNumber: 'CU-WT-010',
      name: 'Linen Overshirt',
      slug: 'linen-overshirt',
      description: 'Breathable linen overshirt',
      price: 120000,
      stock: 2,
      category: 'womens-upperwear',
      categoryLabel: 'Women Upperwear',
      subcategory: 'Shirts',
      productType: 'Pre-Loved',
      condition: 'Mint',
      gender: 'Women',
      tags: ['linen'],
      featured: false,
      isNewArrival: false,
      availability: 'In Stock',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'ACTIVE',
      images: [],
      sizes: ['S', 'M'],
      variants: [variantS, variantM],
    };

    const initialState = cartService.loadCart();
    const first = cartService.addItem(initialState, product, variantS, 1);
    expect(first.error).toBeUndefined();
    expect(first.nextState.items).toHaveLength(1);

    const second = cartService.addItem(first.nextState, product, variantM, 1);
    expect(second.error).toBeUndefined();
    expect(second.nextState.items).toHaveLength(2);

    const third = cartService.addItem(second.nextState, product, variantM, 1);
    expect(third.error).toMatch(/Only 2 total units available/i);
  });
});
