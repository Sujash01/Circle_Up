import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { settingsRepository } from '../repositories/settings.repository.js';
import { BadRequestError, NotFoundError } from '../errors/AppError.js';
import type { Product as ProductType, ProductListQuery } from '@circleup/shared';
import { SEED_PRODUCTS } from '../data/seedProducts.js';
import { isSupabaseConfigured } from './supabase.service.js';
import { supabaseCatalogService } from './supabaseCatalog.service.js';

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export const adminProductService = {
  async listAll(query: ProductListQuery & { includeArchived?: boolean; includeDeleted?: boolean }) {
    if (isSupabaseConfigured()) {
      return supabaseCatalogService.listAdminProducts(query);
    }

    if (!isDbConnected()) {
      return {
        products: SEED_PRODUCTS.map((p) => ({ ...p, id: p.id || p.serialNumber })),
        total: SEED_PRODUCTS.length,
      };
    }

    const filter: Record<string, unknown> = {};

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { serialNumber: new RegExp(q, 'i') },
        { slug: new RegExp(q, 'i') },
      ];
    }

    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    return {
      products: (products as unknown as Array<Record<string, unknown>>).map((p) => ({
        ...p,
        id: p._id ? String(p._id) : undefined,
      })),
      total,
      page,
      limit,
    };
  },

  async create(data: Partial<ProductType>) {
    if (!data.name) throw new BadRequestError('Product name is required.', 'NAME_REQUIRED');
    if (typeof data.price !== 'number' || data.price < 0) {
      throw new BadRequestError('Valid product price in paise is required.', 'INVALID_PRICE');
    }

    if (isSupabaseConfigured()) {
      const created = await supabaseCatalogService.createProduct(data);
      if (isDbConnected()) {
        try {
          await Product.create({
            ...data,
            serialNumber: created.serialNumber,
            slug: created.slug,
          });
          await settingsRepository.bumpVersion();
        } catch {
          // Dual-write best-effort
        }
      }
      return created;
    }

    if (!isDbConnected()) {
      const id = `cu-${Date.now()}`;
      const product = { ...data, id, serialNumber: data.serialNumber || `CU-${Date.now().toString().slice(-3)}` };
      return product;
    }

    let serialNumber = data.serialNumber?.trim().toUpperCase();
    if (!serialNumber) {
      const count = await Product.countDocuments();
      serialNumber = `CU-${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await Product.findOne({ serialNumber });
    if (existing) {
      throw new BadRequestError(`Serial number ${serialNumber} already in use.`, 'DUPLICATE_SERIAL');
    }

    const slug = data.slug?.trim().toLowerCase() || `${slugify(data.name)}-${serialNumber.toLowerCase()}`;

    const product = await Product.create({
      serialNumber,
      name: data.name,
      slug,
      description: data.description || '',
      price: data.price,
      originalPrice: data.originalPrice,
      compareAtPrice: data.compareAtPrice,
      stock: data.stock ?? 1,
      images: data.images && data.images.length > 0 ? data.images : ['/assets/rtw-1.jpg'],
      sizes: data.sizes || [],
      category: data.category || 'thrifted-treasure',
      categoryLabel: data.categoryLabel || 'Thrifted Treasure',
      subcategory: data.subcategory || '',
      productType: data.productType || 'Pre-Loved',
      condition: data.condition || 'Gently Used',
      gender: data.gender || 'Unisex',
      badge: data.badge || '',
      sku: data.sku || serialNumber,
      seoTitle: data.seoTitle || data.name,
      seoDescription: data.seoDescription || data.description || '',
      tags: data.tags || ['thrift'],
      featured: Boolean(data.featured),
      chestPick: Boolean(data.chestPick),
      isNewArrival: Boolean(data.isNewArrival ?? true),
      status: data.status || 'PUBLISHED',
      variants: data.variants || [],
    });

    await settingsRepository.bumpVersion();
    return product.toJSON();
  },

  async update(id: string, updates: Partial<ProductType>) {
    if (isSupabaseConfigured()) {
      const updated = await supabaseCatalogService.updateProduct(id, updates);
      if (isDbConnected()) {
        try {
          const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
          const product = await Product.findOne(query);
          if (product) {
            Object.assign(product, updates);
            if (updates.stock !== undefined) {
              if (updates.stock === 0) product.status = 'SOLD_OUT';
              else if (product.status === 'SOLD_OUT' && updates.stock > 0) product.status = 'ACTIVE';
            }
            await product.save();
            await settingsRepository.bumpVersion();
          }
        } catch {
          // Dual-write best-effort
        }
      }
      return updated;
    }

    if (!isDbConnected()) {
      return { id, ...updates };
    }

    const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
    const product = await Product.findOne(query);
    if (!product) throw new NotFoundError(`Product ${id} not found.`, 'PRODUCT_NOT_FOUND');

    Object.assign(product, updates);
    if (updates.stock !== undefined) {
      if (updates.stock === 0) product.status = 'SOLD_OUT';
      else if (product.status === 'SOLD_OUT' && updates.stock > 0) product.status = 'ACTIVE';
    }

    await product.save();
    await settingsRepository.bumpVersion();
    return product.toJSON();
  },

  async duplicate(id: string) {
    if (isSupabaseConfigured()) {
      const duplicated = await supabaseCatalogService.duplicateProduct(id);
      if (isDbConnected()) {
        try {
          await Product.create({
            ...duplicated,
            _id: undefined,
            id: undefined,
          });
          await settingsRepository.bumpVersion();
        } catch {
          // Dual-write best-effort
        }
      }
      return duplicated;
    }

    if (!isDbConnected()) {
      const source = SEED_PRODUCTS.find((p) => p.serialNumber === id || p.id === id);
      return { id: `cu-copy-${Date.now()}`, name: `${source?.name || 'Product'} (Copy)`, status: 'DRAFT' };
    }

    const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
    const source = await Product.findOne(query).lean();
    if (!source) throw new NotFoundError(`Product ${id} not found.`, 'PRODUCT_NOT_FOUND');

    const count = await Product.countDocuments();
    const newSerial = `CU-${String(count + 1).padStart(3, '0')}`;
    const newName = `${source.name} (Copy)`;
    const newSlug = `${slugify(newName)}-${newSerial.toLowerCase()}`;

    const copyData = {
      ...source,
      _id: undefined,
      id: undefined,
      serialNumber: newSerial,
      name: newName,
      slug: newSlug,
      status: 'DRAFT',
      stock: 1,
      createdAt: undefined,
      updatedAt: undefined,
    };

    const created = await Product.create(copyData);
    await settingsRepository.bumpVersion();
    return created.toJSON();
  },

  async bulkAction(action: 'publish' | 'unpublish' | 'archive' | 'changeCategory' | 'delete', ids: string[], payload?: { category?: string }) {
    if (isSupabaseConfigured()) {
      const res = await supabaseCatalogService.bulkAction(action, ids, payload);
      if (isDbConnected()) {
        try {
          const objectIds = ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
          const query = { $or: [{ _id: { $in: objectIds } }, { serialNumber: { $in: ids } }] };
          let update: Record<string, unknown> = {};
          if (action === 'publish') update = { status: 'PUBLISHED' };
          else if (action === 'unpublish') update = { status: 'DRAFT' };
          else if (action === 'archive') update = { status: 'ARCHIVED' };
          else if (action === 'changeCategory' && payload?.category) update = { category: payload.category };
          else if (action === 'delete') update = { deletedAt: new Date(), status: 'ARCHIVED' };
          await Product.updateMany(query, { $set: update });
          await settingsRepository.bumpVersion();
        } catch {
          // Dual-write best-effort
        }
      }
      return res;
    }

    if (!isDbConnected()) {
      return { modifiedCount: ids.length };
    }

    const objectIds = ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
    const query = { $or: [{ _id: { $in: objectIds } }, { serialNumber: { $in: ids } }] };

    let update: Record<string, unknown> = {};
    if (action === 'publish') update = { status: 'PUBLISHED' };
    else if (action === 'unpublish') update = { status: 'DRAFT' };
    else if (action === 'archive') update = { status: 'ARCHIVED' };
    else if (action === 'changeCategory' && payload?.category) update = { category: payload.category };
    else if (action === 'delete') update = { deletedAt: new Date(), status: 'ARCHIVED' };

    const result = await Product.updateMany(query, { $set: update });
    await settingsRepository.bumpVersion();
    return result;
  },

  async softDelete(id: string) {
    if (isSupabaseConfigured()) {
      const res = await supabaseCatalogService.softDeleteProduct(id);
      if (isDbConnected()) {
        try {
          const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
          await Product.findOneAndUpdate(query, { $set: { deletedAt: new Date(), status: 'ARCHIVED' } });
          await settingsRepository.bumpVersion();
        } catch {}
      }
      return res;
    }

    if (!isDbConnected()) return { message: `Product ${id} deleted` };

    const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
    const product = await Product.findOneAndUpdate(
      query,
      { $set: { deletedAt: new Date(), status: 'ARCHIVED' } },
      { new: true },
    );

    if (!product) throw new NotFoundError(`Product ${id} not found.`, 'PRODUCT_NOT_FOUND');
    await settingsRepository.bumpVersion();
    return { message: `Product ${product.serialNumber} soft-deleted successfully.` };
  },

  async restore(id: string) {
    if (isSupabaseConfigured()) {
      const res = await supabaseCatalogService.restoreProduct(id);
      if (isDbConnected()) {
        try {
          const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
          await Product.findOneAndUpdate(query, { $set: { deletedAt: null, status: 'PUBLISHED' } });
          await settingsRepository.bumpVersion();
        } catch {}
      }
      return res;
    }

    if (!isDbConnected()) return { message: `Product ${id} restored` };

    const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
    const product = await Product.findOneAndUpdate(
      query,
      { $set: { deletedAt: null, status: 'PUBLISHED' } },
      { new: true },
    );

    if (!product) throw new NotFoundError(`Product ${id} not found.`, 'PRODUCT_NOT_FOUND');
    await settingsRepository.bumpVersion();
    return { message: `Product ${product.serialNumber} restored successfully.` };
  },

  async permanentDelete(id: string) {
    if (isSupabaseConfigured()) {
      const res = await supabaseCatalogService.permanentDeleteProduct(id);
      if (isDbConnected()) {
        try {
          const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
          await Product.deleteOne(query);
          await settingsRepository.bumpVersion();
        } catch {}
      }
      return res;
    }

    if (!isDbConnected()) return { message: `Product ${id} deleted permanently` };

    const query = mongoose.isValidObjectId(id) ? { _id: id } : { serialNumber: id.toUpperCase() };
    const product = await Product.findOne(query);
    if (!product) throw new NotFoundError(`Product ${id} not found.`, 'PRODUCT_NOT_FOUND');

    // Rule: Delete permanently blocked if product exists in any customer order
    const inOrder = await Order.findOne({
      $or: [
        { 'items.productId': product._id },
        { 'items.serialNumber': product.serialNumber },
      ],
    });

    if (inOrder) {
      throw new BadRequestError(
        `Cannot permanently delete product ${product.serialNumber} because it exists in existing order ${inOrder.orderNumber}. Soft-delete (archive) instead to preserve customer audit trail.`,
        'PRODUCT_IN_ORDERS',
      );
    }

    await Product.deleteOne({ _id: product._id });
    await settingsRepository.bumpVersion();
    return { message: `Product ${product.serialNumber} permanently removed.` };
  },
};
