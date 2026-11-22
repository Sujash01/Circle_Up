import type { FilterQuery } from 'mongoose';
import { Product, type IProductDocument } from '../models/Product.js';
import { SEED_PRODUCTS } from '../data/seedProducts.js';
import type { Product as ProductType, ProductListQuery } from '@circleup/shared';
import mongoose from 'mongoose';
import { isSupabaseConfigured } from '../services/supabase.service.js';
import { supabaseCatalogService } from '../services/supabaseCatalog.service.js';
import { NotFoundError } from '../errors/AppError.js';

type SeedProduct = ProductType & { chestPick?: boolean; status?: string };

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export const productRepository = {
  async findPublished(
    filter: ProductListQuery,
    pagination: { page: number; limit: number; skip: number },
  ): Promise<{ products: IProductDocument[]; total: number }> {
    if (isSupabaseConfigured()) {
      const res = await supabaseCatalogService.listProducts({
        ...filter,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        products: res.products as unknown as IProductDocument[],
        total: res.total,
      };
    }

    if (!isDbConnected()) {
      let filtered = (SEED_PRODUCTS as unknown as SeedProduct[]).filter(
        (p) => p.status !== 'DRAFT' && p.status !== 'ARCHIVED',
      );
      if (filter.category) filtered = filtered.filter((p) => p.category === filter.category);
      if (filter.subcategory) filtered = filtered.filter((p) => p.subcategory?.toLowerCase() === filter.subcategory?.toLowerCase());
      if (filter.gender) filtered = filtered.filter((p) => p.gender === filter.gender);
      if (filter.condition) filtered = filtered.filter((p) => p.condition === filter.condition);
      if (filter.inStockOnly) filtered = filtered.filter((p) => p.stock > 0);
      if (filter.newArrivalsOnly) filtered = filtered.filter((p) => p.isNewArrival);
      if (filter.featuredOnly) filtered = filtered.filter((p) => p.featured);
      if (filter.minPrice !== undefined) filtered = filtered.filter((p) => p.price >= filter.minPrice!);
      if (filter.maxPrice !== undefined) filtered = filtered.filter((p) => p.price <= filter.maxPrice!);

      if (filter.sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
      else if (filter.sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);

      const total = filtered.length;
      const sliced = filtered.slice(pagination.skip, pagination.skip + pagination.limit);
      return { products: sliced as unknown as IProductDocument[], total };
    }

    const query: FilterQuery<IProductDocument> = {
      status: { $in: ['ACTIVE', 'PUBLISHED'] },
      deletedAt: null,
    };

    if (filter.category) query.category = filter.category;
    if (filter.subcategory) query.subcategory = new RegExp(`^${filter.subcategory}$`, 'i');
    if (filter.gender) query.gender = filter.gender;
    if (filter.condition) query.condition = filter.condition;
    if (filter.inStockOnly) query.stock = { $gt: 0 };
    if (filter.newArrivalsOnly) query.isNewArrival = true;
    if (filter.featuredOnly) query.featured = true;

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      query.price = {};
      if (filter.minPrice !== undefined) query.price.$gte = filter.minPrice;
      if (filter.maxPrice !== undefined) query.price.$lte = filter.maxPrice;
    }

    const sortOption: Record<string, 1 | -1> =
      filter.sort === 'price-asc'
        ? { price: 1 }
        : filter.sort === 'price-desc'
          ? { price: -1 }
          : { createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean({ virtuals: true }),
      Product.countDocuments(query),
    ]);

    return { products: products as unknown as IProductDocument[], total };
  },

  async findBySlugOrId(identifier: string): Promise<IProductDocument | null> {
    if (isSupabaseConfigured()) {
      try {
        const prod = await supabaseCatalogService.getProductByIdentifier(identifier);
        return prod as unknown as IProductDocument;
      } catch (err) {
        if (err instanceof NotFoundError) return null;
        throw err;
      }
    }

    if (!isDbConnected()) {
      const match = SEED_PRODUCTS.find(
        (p) =>
          p.slug === identifier ||
          p.serialNumber?.toLowerCase() === identifier.toLowerCase() ||
          p.id === identifier,
      );
      return (match as unknown as IProductDocument) || null;
    }

    const query: FilterQuery<IProductDocument> = {
      deletedAt: null,
      $or: [{ slug: identifier }, { serialNumber: identifier.toUpperCase() }],
    };

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      query.$or!.push({ _id: new mongoose.Types.ObjectId(identifier) });
    }

    return Product.findOne(query).lean({ virtuals: true }) as Promise<IProductDocument | null>;
  },

  async findRelated(category: string, excludeId?: string, limit = 4): Promise<IProductDocument[]> {
    if (isSupabaseConfigured()) {
      const items = await supabaseCatalogService.getRelatedProducts(excludeId || '', limit);
      return items as unknown as IProductDocument[];
    }

    if (!isDbConnected()) {
      return (SEED_PRODUCTS as unknown as Array<Record<string, unknown>>).filter(
        (p) => p.category === category && p.id !== excludeId && p.status !== 'DRAFT',
      ).slice(0, limit) as unknown as IProductDocument[];
    }

    const query: FilterQuery<IProductDocument> = {
      category,
      status: { $in: ['ACTIVE', 'PUBLISHED'] },
      deletedAt: null,
    };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    const docs = await Product.find(query).limit(limit).lean({ virtuals: true });
    return docs as unknown as IProductDocument[];
  },

  async findChestPicks(): Promise<IProductDocument[]> {
    if (isSupabaseConfigured()) {
      const picks = await supabaseCatalogService.findChestPicks();
      return picks as unknown as IProductDocument[];
    }

    if (!isDbConnected()) {
      const picks = (SEED_PRODUCTS as unknown as Array<Record<string, unknown>>).filter((p) => Boolean(p.chestPick));
      if (picks.length > 0) {
        if (picks.length >= 6) return picks.slice(0, 6) as unknown as IProductDocument[];
        const existingIds = new Set(picks.map((p) => (p as { id?: string }).id));
        const extra = (SEED_PRODUCTS as unknown as Array<Record<string, unknown>>)
          .filter((p) => !existingIds.has((p as { id?: string }).id))
          .slice(0, 6 - picks.length);
        return [...picks, ...extra] as unknown as IProductDocument[];
      }
      return SEED_PRODUCTS.slice(0, 6) as unknown as IProductDocument[];
    }

    const picks = await Product.find({
      chestPick: true,
      status: { $in: ['ACTIVE', 'PUBLISHED'] },
      deletedAt: null,
    })
      .limit(6)
      .lean({ virtuals: true });

    if (picks.length > 0) {
      if (picks.length >= 6) return picks as unknown as IProductDocument[];
      const existingIds = new Set(picks.map((p) => String((p as { _id?: unknown })._id)));
      const fallback = await Product.find({
        _id: { $nin: Array.from(existingIds) },
        status: { $in: ['ACTIVE', 'PUBLISHED'] },
        deletedAt: null,
      })
        .sort({ featured: -1, createdAt: -1 })
        .limit(6 - picks.length)
        .lean({ virtuals: true });
      return [...picks, ...fallback] as unknown as IProductDocument[];
    }

    // Fallback to newest featured if fewer than 4 explicitly tagged
    const fallback = await Product.find({
      status: { $in: ['ACTIVE', 'PUBLISHED'] },
      deletedAt: null,
    })
      .sort({ featured: -1, createdAt: -1 })
      .limit(6)
      .lean({ virtuals: true });

    return fallback as unknown as IProductDocument[];
  },

  async findCollectionRow(category: string, limit = 4): Promise<IProductDocument[]> {
    if (isSupabaseConfigured()) {
      const docs = await supabaseCatalogService.findCollectionRow(category, limit);
      return docs as unknown as IProductDocument[];
    }

    if (!isDbConnected()) {
      return (SEED_PRODUCTS as unknown as Array<Record<string, unknown>>).filter(
        (p) => p.category === category || (Array.isArray(p.tags) && p.tags.includes(category)),
      ).slice(0, limit) as unknown as IProductDocument[];
    }

    const docs = await Product.find({
      $or: [{ category }, { tags: category }],
      status: { $in: ['ACTIVE', 'PUBLISHED'] },
      deletedAt: null,
    })
      .sort({ isNewArrival: -1, createdAt: -1 })
      .limit(limit)
      .lean({ virtuals: true });

    return docs as unknown as IProductDocument[];
  },
};
