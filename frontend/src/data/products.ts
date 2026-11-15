import type { Product } from '@/types/storefront';

/**
 * Production Catalog Store.
 * Starts empty (0 demo products). Real items added through the admin panel
 * or Supabase database are dynamically synchronized via productService.
 */
export const PRODUCTS: Product[] = [];
