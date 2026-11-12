import mongoose from 'mongoose';
import { Product, type IProductDocument } from '../../models/Product.js';
import { SEED_PRODUCTS } from '../../data/seedProducts.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import { buildPaginationMeta, parsePagination, type ParsedPagination } from '../../utils/pagination.js';
import type { IProductItem, ProductListQuery } from '@circleup/shared';

function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const productService = {
  async listProducts(query: ProductListQuery) {
    const { page, limit, skip } = parsePagination(query as { page?: unknown; limit?: unknown });
    const {
      category,
      subcategory,
      condition,
      gender,
      size,
      minPrice,
      maxPrice,
      inStockOnly,
      newArrivalsOnly,
      featuredOnly,
      search,
      sort = 'newest',
    } = query;

    if (isDatabaseConnected()) {
      const filter: Record<string, unknown> = {
        status: { $ne: 'ARCHIVED' },
      };

      if (category && category !== 'all') {
        filter.category = category;
      }

      if (subcategory && subcategory !== 'all') {
        filter.$or = [
          { subcategory: new RegExp(subcategory, 'i') },
          { tags: new RegExp(subcategory, 'i') },
        ];
      }

      if (condition && condition !== 'all') {
        filter.condition = condition;
      }

      if (gender && gender !== 'all') {
        filter.$or = [{ gender }, { gender: 'Unisex' }];
      }

      if (size && size !== 'all') {
        filter.sizes = size;
      }

      if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
        filter.price = {};
        if (typeof minPrice === 'number') (filter.price as Record<string, number>).$gte = minPrice;
        if (typeof maxPrice === 'number') (filter.price as Record<string, number>).$lte = maxPrice;
      }

      if (inStockOnly) {
        filter.stock = { $gt: 0 };
        filter.status = 'ACTIVE';
      }

      if (newArrivalsOnly) {
        filter.isNewArrival = true;
      }

      if (featuredOnly) {
        filter.featured = true;
      }

      if (search && search.trim()) {
        const trimmed = search.trim();
        filter.$or = [
          { serialNumber: new RegExp(trimmed, 'i') },
          { name: new RegExp(trimmed, 'i') },
          { description: new RegExp(trimmed, 'i') },
          { subcategory: new RegExp(trimmed, 'i') },
          { tags: new RegExp(trimmed, 'i') },
        ];
      }

      const sortOptions: Record<string, 1 | -1> = {};
      if (sort === 'price-asc') sortOptions.price = 1;
      else if (sort === 'price-desc') sortOptions.price = -1;
      else sortOptions.createdAt = -1;

      const [products, total] = await Promise.all([
        Product.find(filter).sort(sortOptions).skip(skip).limit(limit).lean(),
        Product.countDocuments(filter),
      ]);

      return {
        products: (products as unknown as Array<Record<string, unknown>>).map((p) => ({
          ...p,
          id: p._id ? String(p._id) : undefined,
        })),
        meta: buildPaginationMeta(page, limit, total),
      };
    }

    // Degraded fallback using SEED_PRODUCTS in-memory
    const searchLower = (search || '').trim().toLowerCase();
    const filtered = (SEED_PRODUCTS as unknown as IProductItem[]).filter((p) => {
      if (category && category !== 'all' && p.category !== category) return false;
      if (condition && condition !== 'all' && p.condition !== condition) return false;
      if (gender && gender !== 'all' && p.gender !== gender && p.gender !== 'Unisex') return false;
      if (size && size !== 'all' && !p.sizes?.includes(size)) return false;
      if (typeof minPrice === 'number' && p.price < minPrice) return false;
      if (typeof maxPrice === 'number' && p.price > maxPrice) return false;
      if (inStockOnly && p.stock <= 0) return false;
      if (newArrivalsOnly && !p.isNewArrival) return false;
      if (featuredOnly && !p.featured) return false;
      if (searchLower) {
        const text = [p.serialNumber, p.name, p.description, p.subcategory, ...(p.tags || [])]
          .join(' ')
          .toLowerCase();
        if (!text.includes(searchLower)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const paginated = sorted.slice(skip, skip + limit);
    return {
      products: paginated,
      meta: buildPaginationMeta(page, limit, sorted.length),
    };
  },

  async getProductByIdentifier(identifier: string) {
    const trimmed = identifier.trim();

    if (isDatabaseConnected()) {
      const isObjectId = mongoose.isValidObjectId(trimmed);
      const orClauses: Array<Record<string, unknown>> = [
        { serialNumber: trimmed.toUpperCase() },
        { slug: trimmed.toLowerCase() },
      ];
      if (isObjectId) {
        orClauses.push({ _id: trimmed });
      }

      const product = await Product.findOne({ $or: orClauses }).lean();
      if (!product) {
        throw new NotFoundError(`Product not found for identifier "${identifier}"`, 'PRODUCT_NOT_FOUND');
      }

      return {
        ...product,
        id: product._id ? String(product._id) : undefined,
      };
    }

    // Degraded fallback
    const found = (SEED_PRODUCTS as unknown as IProductItem[]).find(
      (p) =>
        p.serialNumber?.toUpperCase() === trimmed.toUpperCase() ||
        p.slug?.toLowerCase() === trimmed.toLowerCase() ||
        p.id === trimmed,
    );

    if (!found) {
      throw new NotFoundError(`Product not found for identifier "${identifier}"`, 'PRODUCT_NOT_FOUND');
    }
    return found;
  },

  async createProduct(payload: Partial<IProductItem>) {
    if (!isDatabaseConnected()) {
      throw new BadRequestError('MongoDB is currently disconnected. Please configure MONGODB_URI in backend/.env to write new products.', 'DATABASE_DISCONNECTED');
    }

    if (!payload.name) {
      throw new BadRequestError('Product name is required', 'MISSING_NAME');
    }
    if (typeof payload.price !== 'number' || payload.price < 0) {
      throw new BadRequestError('Valid product price is required', 'INVALID_PRICE');
    }
    if (typeof payload.stock !== 'number' || payload.stock < 0) {
      throw new BadRequestError('Valid product stock count is required', 'INVALID_STOCK');
    }

    let serialNumber = payload.serialNumber?.trim().toUpperCase();
    if (!serialNumber) {
      const count = await Product.countDocuments();
      serialNumber = `CU-${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await Product.findOne({ serialNumber });
    if (existing) {
      throw new BadRequestError(`Product with serial number "${serialNumber}" already exists`, 'DUPLICATE_SERIAL_NUMBER');
    }

    const slug = payload.slug?.trim().toLowerCase() || `${slugify(payload.name)}-${serialNumber.toLowerCase()}`;

    const sizes = Array.isArray(payload.sizes) ? payload.sizes : [];
    const images = Array.isArray(payload.images) && payload.images.length > 0 ? payload.images : ['/assets/rtw-1.jpg'];

    const newProduct = await Product.create({
      serialNumber,
      name: payload.name,
      slug,
      description: payload.description || '',
      price: payload.price,
      originalPrice: payload.originalPrice,
      stock: payload.stock,
      images,
      sizes,
      category: payload.category || 'thrifted-treasure',
      categoryLabel: payload.categoryLabel || 'Thrifted Treasure',
      subcategory: payload.subcategory || '',
      productType: payload.productType || 'Pre-Loved',
      condition: payload.condition || 'Gently Used',
      gender: payload.gender || 'Unisex',
      measurements: payload.measurements || '',
      makerNote: payload.makerNote || '',
      tags: payload.tags || ['thrift'],
      featured: payload.featured ?? false,
      isNewArrival: payload.isNewArrival ?? true,
      status: payload.stock > 0 ? (payload.status || 'ACTIVE') : 'SOLD_OUT',
      variants: payload.variants || sizes.map((s, idx) => ({
        id: `${serialNumber.toLowerCase()}-${idx}`,
        label: `Size ${s}`,
        size: s,
        stock: Math.max(1, Math.floor(payload.stock! / Math.max(1, sizes.length))),
      })),
    });

    return newProduct.toJSON();
  },

  async updateProduct(serialNumber: string, updates: Partial<IProductItem>) {
    if (!isDatabaseConnected()) {
      throw new BadRequestError('MongoDB is currently disconnected.', 'DATABASE_DISCONNECTED');
    }

    const product = await Product.findOne({ serialNumber: serialNumber.trim().toUpperCase() });
    if (!product) {
      throw new NotFoundError(`Product with serial number "${serialNumber}" not found`, 'PRODUCT_NOT_FOUND');
    }

    if (updates.name) product.name = updates.name;
    if (typeof updates.price === 'number') product.price = updates.price;
    if (typeof updates.originalPrice === 'number') product.originalPrice = updates.originalPrice;
    if (typeof updates.stock === 'number') {
      product.stock = updates.stock;
      if (product.stock === 0) product.status = 'SOLD_OUT';
      else if (product.status === 'SOLD_OUT' && product.stock > 0) product.status = 'ACTIVE';
    }
    if (updates.description !== undefined) product.description = updates.description;
    if (updates.images) product.images = updates.images;
    if (updates.sizes) product.sizes = updates.sizes;
    if (updates.category) product.category = updates.category;
    if (updates.categoryLabel) product.categoryLabel = updates.categoryLabel;
    if (updates.subcategory !== undefined) product.subcategory = updates.subcategory;
    if (updates.condition) product.condition = updates.condition;
    if (updates.gender) product.gender = updates.gender;
    if (updates.measurements !== undefined) product.measurements = updates.measurements;
    if (updates.makerNote !== undefined) product.makerNote = updates.makerNote;
    if (updates.tags) product.tags = updates.tags;
    if (updates.featured !== undefined) product.featured = updates.featured;
    if (updates.isNewArrival !== undefined) product.isNewArrival = updates.isNewArrival;
    if (updates.status) product.status = updates.status;

    await product.save();
    return product.toJSON();
  },

  async deleteProduct(serialNumber: string) {
    if (!isDatabaseConnected()) {
      throw new BadRequestError('MongoDB is currently disconnected.', 'DATABASE_DISCONNECTED');
    }

    const product = await Product.findOneAndUpdate(
      { serialNumber: serialNumber.trim().toUpperCase() },
      { status: 'ARCHIVED' },
      { new: true },
    );

    if (!product) {
      throw new NotFoundError(`Product with serial number "${serialNumber}" not found`, 'PRODUCT_NOT_FOUND');
    }
    return { message: `Product ${serialNumber} archived successfully` };
  },

  async seedCatalog() {
    if (!isDatabaseConnected()) {
      throw new BadRequestError('Cannot seed catalog: MongoDB is not connected.', 'DATABASE_DISCONNECTED');
    }

    let seededCount = 0;
    for (const item of SEED_PRODUCTS as unknown as IProductItem[]) {
      await Product.findOneAndUpdate(
        { serialNumber: item.serialNumber.toUpperCase() },
        {
          $set: {
            serialNumber: item.serialNumber.toUpperCase(),
            name: item.name,
            slug: item.slug,
            description: item.description,
            price: item.price,
            originalPrice: item.originalPrice,
            stock: item.stock ?? 1,
            images: item.images,
            sizes: item.sizes || [],
            category: item.category,
            categoryLabel: item.categoryLabel || '',
            subcategory: item.subcategory || '',
            productType: item.productType || 'Pre-Loved',
            condition: item.condition || 'Gently Used',
            gender: item.gender || 'Unisex',
            measurements: item.measurements || '',
            makerNote: item.makerNote || '',
            tags: item.tags || [],
            featured: item.featured ?? false,
            isNewArrival: item.isNewArrival ?? true,
            status: (item.stock ?? 1) > 0 ? 'ACTIVE' : 'SOLD_OUT',
            variants: item.variants || [],
          },
        },
        { upsert: true, new: true },
      );
      seededCount++;
    }

    return { message: `Successfully seeded ${seededCount} thrift products into MongoDB`, count: seededCount };
  },
};
