import { describe, expect, it } from 'vitest';
import {
  INVENTORY_CATEGORIES,
  extractCategoryCodeFromSerial,
  productConditionSchema,
  productSchema,
  requiresNewProductMinStock,
} from '@circleup/shared';

describe('Footwear category & New Without Tags / Minor Defects conditions (shared & backend)', () => {
  it('registers FW Footwear in INVENTORY_CATEGORIES and extracts FW from serial numbers', () => {
    expect(INVENTORY_CATEGORIES.FW).toMatchObject({
      code: 'FW',
      name: 'Footwear',
      department: 'Accessories',
      defaultCategorySlug: 'footwear',
    });
    expect(extractCategoryCodeFromSerial('FW-042')).toBe('FW');
  });

  it('accepts New Without Tags, Minor Defects, and all existing condition values', () => {
    const expected = [
      'New With Tags',
      'New Without Tags',
      'Mint',
      'Gently Used',
      'Vintage Wear',
      'Minor Defects',
      'Artisan Made',
    ];
    for (const condition of expected) {
      expect(productConditionSchema.safeParse(condition).success).toBe(true);
    }
    expect(productConditionSchema.safeParse('Invalid Condition').success).toBe(false);
  });

  it('persists Footwear, New Without Tags, and Minor Defects without altering stock or status rules', () => {
    const jewelleryNoTags = productSchema.parse({
      serialNumber: 'JW-101',
      name: 'Brass Hoop Earrings',
      slug: 'brass-hoop-earrings',
      price: 49900,
      stock: 1,
      images: ['https://example.com/earrings.jpg'],
      category: 'jewellery',
      productType: 'Pre-Loved',
      condition: 'New Without Tags',
      status: 'AVAILABLE',
    });
    expect(jewelleryNoTags.condition).toBe('New Without Tags');
    expect(jewelleryNoTags.status).toBe('AVAILABLE');
    expect(requiresNewProductMinStock(jewelleryNoTags)).toBe(false);

    const footwearMinorDefects = productSchema.parse({
      serialNumber: 'FW-019',
      name: 'Vintage Leather Loafers',
      slug: 'vintage-leather-loafers',
      price: 185000,
      stock: 1,
      images: ['https://example.com/loafers.jpg'],
      category: 'footwear',
      productType: 'Pre-Loved',
      condition: 'Minor Defects',
      status: 'AVAILABLE',
    });
    expect(footwearMinorDefects.category).toBe('footwear');
    expect(footwearMinorDefects.condition).toBe('Minor Defects');
    expect(footwearMinorDefects.status).toBe('AVAILABLE');
    expect(requiresNewProductMinStock(footwearMinorDefects)).toBe(false);
  });
});
