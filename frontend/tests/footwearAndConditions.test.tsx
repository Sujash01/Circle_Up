import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { productService } from '../src/services/productService';
import { INVENTORY_CATEGORIES } from '@circleup/shared';

describe('Footwear category & New Without Tags / Minor Defects conditions (frontend)', () => {
  it('exposes Footwear, New Without Tags, and Minor Defects in ProductFormPage', () => {
    const formSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/admin/pages/ProductFormPage.tsx'),
      'utf8',
    );
    expect(formSrc).toContain('<option value="footwear">Footwear</option>');
    expect(formSrc).toContain('<option value="New Without Tags">New Without Tags</option>');
    expect(formSrc).toContain('<option value="Minor Defects">Minor Defects (Minor Imperfections)</option>');
    expect(INVENTORY_CATEGORIES.FW?.defaultCategorySlug).toBe('footwear');
  });

  it('classifies Footwear items under footwear and excludes them from Thrifted Treasure', () => {
    productService.setProducts([
      {
        id: 'fw-1',
        serialNumber: 'FW-010',
        name: 'Classic Leather Loafers',
        slug: 'classic-leather-loafers',
        description: 'Classic leather loafers',
        price: 220000,
        stock: 1,
        images: ['https://example.com/loafers.jpg'],
        sizes: ['UK 7'],
        variants: [],
        category: 'footwear',
        categoryLabel: 'Footwear',
        subcategory: 'Loafers',
        productType: 'Pre-Loved',
        condition: 'Minor Defects',
        gender: 'Unisex',
        tags: ['footwear'],
        featured: false,
        isNewArrival: false,
        status: 'AVAILABLE',
        availability: 'In Stock',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'jw-1',
        serialNumber: 'JW-011',
        name: 'Gold Plated Studs',
        slug: 'gold-plated-studs',
        description: 'New without tags',
        price: 65000,
        stock: 1,
        images: ['https://example.com/studs.jpg'],
        sizes: ['One Size'],
        variants: [],
        category: 'jewellery',
        categoryLabel: 'Jewellery',
        subcategory: 'Earrings',
        productType: 'Pre-Loved',
        condition: 'New Without Tags',
        gender: 'Women',
        tags: ['jewellery'],
        featured: false,
        isNewArrival: false,
        status: 'AVAILABLE',
        availability: 'In Stock',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const footwearItems = productService.queryProducts({ category: 'footwear' });
    expect(footwearItems.map((p) => p.id)).toEqual(['fw-1']);

    const treasureItems = productService.queryProducts({ category: 'thrifted-treasure' });
    expect(treasureItems.map((p) => p.id)).not.toContain('fw-1');

    const brandNewItems = productService.queryProducts({ brandNewOnly: true });
    expect(brandNewItems.map((p) => p.id)).toContain('jw-1');

    const thriftedItems = productService.queryProducts({ thriftedOnly: true });
    expect(thriftedItems.map((p) => p.id)).toContain('fw-1');
  });

  it('displays New Without Tags and Minor Defects cleanly on ProductDetailPage', () => {
    const detailSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/features/public/ProductDetailPage.tsx'),
      'utf8',
    );
    expect(detailSrc).toContain("product.condition === 'New Without Tags'");
    expect(detailSrc).toContain("product.condition === 'Minor Defects'");
  });
});
