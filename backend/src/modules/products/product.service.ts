import type { IProductItem, ProductListQuery } from '@circleup/shared';
import { BadRequestError } from '../../errors/AppError.js';
import { SEED_PRODUCTS } from '../../data/seedProducts.js';
import { supabaseCatalogService } from '../../services/supabaseCatalog.service.js';

export const productService = {
  listProducts(query: ProductListQuery) {
    return supabaseCatalogService.listProducts(query);
  },

  getProductByIdentifier(identifier: string) {
    return supabaseCatalogService.getProductByIdentifier(identifier);
  },

  getRelatedProducts(identifier: string, limit = 4) {
    return supabaseCatalogService.getRelatedProducts(identifier, limit);
  },

  createProduct(payload: Partial<IProductItem>) {
    if (!payload.name) throw new BadRequestError('Product name is required.', 'MISSING_NAME');
    if (typeof payload.price !== 'number' || !Number.isSafeInteger(payload.price) || payload.price < 0) {
      throw new BadRequestError('Valid product price in paise is required.', 'INVALID_PRICE');
    }
    if (typeof payload.stock !== 'number' || !Number.isInteger(payload.stock) || payload.stock < 0) {
      throw new BadRequestError('Valid product stock count is required.', 'INVALID_STOCK');
    }
    return supabaseCatalogService.createProduct(payload);
  },

  updateProduct(identifier: string, updates: Partial<IProductItem>) {
    return supabaseCatalogService.updateProduct(identifier, updates);
  },

  deleteProduct(identifier: string) {
    return supabaseCatalogService.softDeleteProduct(identifier);
  },

  async seedCatalog() {
    const seeded = await supabaseCatalogService.seedProducts(
      SEED_PRODUCTS as unknown as Array<Partial<IProductItem>>,
    );
    return { message: `Successfully seeded ${seeded} products into Supabase`, count: seeded };
  },
};
