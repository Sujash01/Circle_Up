import { z } from 'zod';
import { moneyPaiseSchema } from './money.js';

export const productImageSchema = z.object({
  url: z.string().min(1),
  alt: z.string().default('CircleUp product preview'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isCover: z.boolean().default(false),
  order: z.number().int().nonnegative().default(0),
});
export type ProductImage = z.infer<typeof productImageSchema>;

export const productMeasurementsSchema = z.object({
  bust: z.string().optional(),
  waist: z.string().optional(),
  shoulder: z.string().optional(),
  sleeve: z.string().optional(),
  chest: z.string().optional(),
  length: z.string().optional(),
  underbust: z.string().optional(),
  hip: z.string().optional(),
  inseam: z.string().optional(),
}).passthrough();
export type ProductMeasurements = z.infer<typeof productMeasurementsSchema>;

export const productVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  size: z.string(),
  stock: z.number().int().nonnegative().default(1),
  priceOverride: moneyPaiseSchema.optional(),
  measurements: productMeasurementsSchema.optional(),
});
export type ProductVariant = z.infer<typeof productVariantSchema>;

export const productStatusSchema = z.enum([
  'AVAILABLE',
  'SOLD',
  'BOOKED',
  'MISSING',
  'NEED_ATTENTION',
  'EXCHANGE_BARTER',
  'RENT',
  'ACTIVE',
  'PUBLISHED',
  'SOLD_OUT',
  'DRAFT',
  'ARCHIVED',
]);
export const productTypeSchema = z.enum([
  'Pre-Loved',
  'Fresh Find',
  'Handcrafted',
  'Rental',
]);
export const productConditionSchema = z.enum([
  'New With Tags',
  'New Without Tags',
  'Mint',
  'Gently Used',
  'Vintage Wear',
  'Minor Defects',
  'Artisan Made',
]);
export const productGenderSchema = z.enum(['Women', 'Men', 'Unisex']);

export const productSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(),
  serialNumber: z.string().min(1),
  categoryCode: z.string().optional(),
  sizeCategory: z.string().optional(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1),
  description: z.string().default(''),
  price: moneyPaiseSchema,
  originalPrice: moneyPaiseSchema.optional(),
  compareAtPrice: moneyPaiseSchema.optional(),
  stock: z.number().int().nonnegative().default(1),
  images: z.array(z.string()).min(1, 'At least one image is required'),
  imageDetails: z.array(productImageSchema).optional(),
  sizes: z.array(z.string()).default([]),
  variants: z.array(productVariantSchema).default([]),
  category: z.string().min(1),
  categoryLabel: z.string().optional(),
  subcategory: z.string().optional(),
  productType: productTypeSchema.default('Pre-Loved'),
  condition: productConditionSchema.default('Gently Used'),
  gender: productGenderSchema.default('Unisex'),
  measurements: z.union([z.string(), productMeasurementsSchema]).optional(),
  measurementsData: z.record(z.string()).optional(),
  makerNote: z.string().optional(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  chestPick: z.boolean().default(false),
  badge: z.string().optional(),
  sku: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  status: productStatusSchema.default('AVAILABLE'),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Product = z.infer<typeof productSchema>;
export type IProductItem = Product;

export const productListQuerySchema = z.object({
  category: z.string().optional(),
  subcategory: z.string().optional(),
  condition: z.string().optional(),
  gender: z.string().optional(),
  size: z.string().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  inStockOnly: z.coerce.boolean().optional(),
  newArrivalsOnly: z.coerce.boolean().optional(),
  featuredOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'price-asc', 'price-desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(48).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const NEW_PRODUCT_MIN_STOCK = 15;
export const NEW_PRODUCT_MIN_STOCK_MESSAGE = 'Minimum stock quantity for a new product is 15.';

export function requiresNewProductMinStock(input: {
  category?: string | null;
  condition?: string | null;
  productType?: string | null;
}): boolean {
  if (input.category === 'thrifted-treasure' || input.category === 'rentals') {
    return false;
  }
  return input.condition === 'New With Tags' || input.productType === 'Fresh Find';
}
