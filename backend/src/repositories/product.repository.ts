import type { IProductItem, ProductListQuery } from '@circleup/shared';
import { supabaseCatalogService } from '../services/supabaseCatalog.service.js';

export const productRepository = {
  async findPublished(
    filter: ProductListQuery,
    pagination: { page: number; limit: number; skip: number },
  ): Promise<{ products: IProductItem[]; total: number }> {
    const result = await supabaseCatalogService.listProducts({
      ...filter,
      page: pagination.page,
      limit: pagination.limit,
    });
    return { products: result.products, total: result.total };
  },

  findBySlugOrId(identifier: string): Promise<IProductItem> {
    return supabaseCatalogService.getProductByIdentifier(identifier);
  },

  findRelated(identifier: string, _excludeId?: string, limit = 4): Promise<IProductItem[]> {
    return supabaseCatalogService.getRelatedProducts(identifier, limit);
  },

  findChestPicks(): Promise<IProductItem[]> {
    return supabaseCatalogService.findChestPicks();
  },

  findCollectionRow(category: string, limit = 4): Promise<IProductItem[]> {
    return supabaseCatalogService.findCollectionRow(category, limit);
  },
};
