import { describe, expect, it } from 'vitest';
import { normalizeCategorySlug, productService } from '../src/services/productService';
import type { Product } from '../src/types/storefront';

const baseProduct: Product = {
  id: 'pub-1',
  serialNumber: 'CU-EX-100',
  name: 'Curated Vintage Lamp',
  slug: 'curated-vintage-lamp',
  description: 'Restored brass lamp.',
  price: 180000,
  stock: 1,
  category: 'thrifted-treasure',
  categoryLabel: 'Thrifted Treasure',
  subcategory: 'Home & Living',
  productType: 'Pre-Loved',
  condition: 'Vintage Wear',
  gender: 'Unisex',
  sizes: ['One Size'],
  variants: [{ id: 'v-1', label: 'One Size', size: 'One Size', stock: 1 }],
  images: ['https://cdn.example.com/lamp.webp'],
  tags: ['thrift'],
  featured: false,
  isNewArrival: false,
  availability: 'In Stock',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('Storefront Product Visibility Filtering', () => {
  it('excludes DRAFT, ARCHIVED, MISSING, and NEED_ATTENTION products from public productService helpers', () => {
    const prev = productService.getAllProducts();
    productService.setProducts([
      { ...baseProduct, id: 'pub-1', slug: 'pub-1', status: 'ACTIVE' },
      { ...baseProduct, id: 'draft-1', slug: 'draft-1', status: 'DRAFT' },
      { ...baseProduct, id: 'arch-1', slug: 'arch-1', status: 'ARCHIVED' },
      { ...baseProduct, id: 'miss-1', slug: 'miss-1', status: 'MISSING' },
      { ...baseProduct, id: 'need-1', slug: 'need-1', status: 'NEED_ATTENTION' },
    ]);

    expect(productService.getAllProducts().map((p) => p.id)).toEqual(['pub-1']);
    expect(productService.queryProducts({ category: 'thrifted-treasure' }).map((p) => p.id)).toEqual(['pub-1']);
    expect(productService.getProductBySlug('draft-1')).toBeUndefined();

    productService.setProducts(prev);
  });

  it('normalizes ordinary apparel away from thrifted-treasure while preserving treasure categories', () => {
    expect(normalizeCategorySlug('T-Shirts', 'CU-MS-001')).toBe('mens-upperwear');
    expect(normalizeCategorySlug('', 'CU-MS-001')).toBe('mens-upperwear');
    expect(normalizeCategorySlug('Books', 'CU-EX-001')).toBe('thrifted-treasure');
    expect(normalizeCategorySlug('', 'CU-EX-001')).toBe('thrifted-treasure');
  });
});
