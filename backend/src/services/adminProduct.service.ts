import type { Product as ProductType, ProductListQuery } from '@circleup/shared';
import { settingsRepository } from '../repositories/settings.repository.js';
import { supabaseCatalogService } from './supabaseCatalog.service.js';

async function bumpCatalogVersion(): Promise<void> {
  try {
    await settingsRepository.bumpVersion();
  } catch {
    // Product persistence is authoritative; cache version bump is best effort.
  }
}

export const adminProductService = {
  listAll(query: ProductListQuery & { includeArchived?: boolean; includeDeleted?: boolean }) {
    return supabaseCatalogService.listAdminProducts(query);
  },

  getById(id: string) {
    return supabaseCatalogService.getAdminProduct(id);
  },

  async create(data: Partial<ProductType>) {
    const created = await supabaseCatalogService.createProduct(data);
    await bumpCatalogVersion();
    return created;
  },

  async update(id: string, updates: Partial<ProductType>) {
    const updated = await supabaseCatalogService.updateProduct(id, updates);
    await bumpCatalogVersion();
    return updated;
  },

  async duplicate(id: string) {
    const duplicated = await supabaseCatalogService.duplicateProduct(id);
    await bumpCatalogVersion();
    return duplicated;
  },

  async bulkAction(
    action: 'publish' | 'unpublish' | 'archive' | 'changeCategory' | 'delete',
    ids: string[],
    payload?: { category?: string },
  ) {
    const result = await supabaseCatalogService.bulkAction(action, ids, payload);
    await bumpCatalogVersion();
    return result;
  },

  async softDelete(id: string) {
    const result = await supabaseCatalogService.softDeleteProduct(id);
    await bumpCatalogVersion();
    return result;
  },

  async restore(id: string) {
    const result = await supabaseCatalogService.restoreProduct(id);
    await bumpCatalogVersion();
    return result;
  },

  async permanentDelete(id: string) {
    const result = await supabaseCatalogService.permanentDeleteProduct(id);
    await bumpCatalogVersion();
    return result;
  },
};
