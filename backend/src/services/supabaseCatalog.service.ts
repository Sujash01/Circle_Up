import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './supabase.service.js';
import { NotFoundError, ServiceUnavailableError, BadRequestError } from '../errors/AppError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import {
  extractCategoryCodeFromSerial,
  normalizePriceToPaise,
  type IProductItem,
  type ProductListQuery,
  type Product as ProductType,
} from '@circleup/shared';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cleanFilterText = (value: string) => value.trim().replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 80);

// Publicly visible statuses for storefront customers
export const PUBLIC_STOREFRONT_STATUSES = [
  'AVAILABLE',
  'ACTIVE',
  'PUBLISHED',
  'SOLD',
  'BOOKED',
  'EXCHANGE_BARTER',
  'RENT',
  'SOLD_OUT',
];

// Back-of-house internal statuses hidden from public shoppers
export const INTERNAL_HIDDEN_STATUSES = [
  'MISSING',
  'NEED_ATTENTION',
  'DRAFT',
  'ARCHIVED',
];

function buildProductRow(
  data: Partial<ProductType>,
  serialNumber: string,
  slug: string,
  categoryCode: string | undefined,
): Record<string, unknown> {
  const measurements = data.measurements;
  const measurementsData = (data as Partial<ProductType> & { measurementsData?: Record<string, string> }).measurementsData;
  return {
    serial_number: serialNumber,
    category_code: categoryCode || null,
    size_category: data.sizeCategory || null,
    measurements: typeof measurements === 'string' ? measurements : null,
    measurements_data: measurementsData || (typeof measurements === 'object' && measurements ? measurements : {}),
    maker_note: data.makerNote || null,
    name: data.name,
    slug,
    description: data.description || '',
    price: data.price !== undefined ? normalizePriceToPaise(data.price) : 0,
    original_price: data.originalPrice != null ? normalizePriceToPaise(data.originalPrice) : null,
    compare_at_price: data.compareAtPrice != null ? normalizePriceToPaise(data.compareAtPrice) : null,
    stock: data.stock ?? 1,
    images: Array.isArray(data.images) ? data.images : [],
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
    variants: Array.isArray(data.variants) ? data.variants : [],
    category: data.category || 'thrifted-treasure',
    category_label: data.categoryLabel || 'Thrifted Treasure',
    subcategory: data.subcategory || '',
    product_type: data.productType || 'Pre-Loved',
    condition: data.condition || 'Gently Used',
    gender: data.gender || 'Unisex',
    badge: data.badge || null,
    sku: data.sku || serialNumber,
    seo_title: data.seoTitle || data.name,
    seo_description: data.seoDescription || data.description || '',
    tags: Array.isArray(data.tags) ? data.tags : ['thrift'],
    featured: Boolean(data.featured),
    chest_pick: Boolean(data.chestPick),
    is_new_arrival: Boolean(data.isNewArrival ?? true),
    status: data.status || 'PUBLISHED',
  };
}

/**
 * Maps a snake_case Supabase `public.products` row into the canonical camelCase `IProductItem`.
 * Guarantees zero fields are discarded.
 */
export function mapSupabaseRowToProductItem(row: Record<string, unknown>): IProductItem {
  const stock = typeof row.stock === 'number' ? row.stock : Number(row.stock ?? 0);
  const images = Array.isArray(row.images) ? (row.images as string[]) : [];
  const sizes = Array.isArray(row.sizes) ? (row.sizes as string[]) : [];
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
  const rawSerial = String(row.serial_number || row.id || '').toUpperCase();
  const serialForCode = rawSerial.startsWith('CU-') ? rawSerial.slice(3) : rawSerial;
  const catCode =
    (row.category_code as string) ||
    (serialForCode ? extractCategoryCodeFromSerial(serialForCode) : undefined);

  return {
    id: String(row.id),
    _id: String(row.id),
    serialNumber: rawSerial,
    categoryCode: catCode,
    sizeCategory: (row.size_category as string) || undefined,
    name: String(row.name || ''),
    slug: String(row.slug || ''),
    description: String(row.description || ''),
    price: normalizePriceToPaise(row.price),
    originalPrice: row.original_price != null ? normalizePriceToPaise(row.original_price) : undefined,
    compareAtPrice: row.compare_at_price != null ? normalizePriceToPaise(row.compare_at_price) : undefined,
    stock,
    images,
    sizes,
    variants:
      Array.isArray(row.variants) && row.variants.length > 0
        ? (row.variants as ProductType['variants'])
        : (sizes.length > 0 ? sizes : ['One Size']).map((sz, idx) => ({
          id: `${rawSerial || 'var'}-${idx}-${sz.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          label: sz,
          size: sz,
          stock: Math.max(1, Math.floor(stock / (sizes.length || 1))),
        })),
    category: String(row.category || ''),
    categoryLabel: (row.category_label as string) || undefined,
    subcategory: (row.subcategory as string) || undefined,
    productType: (row.product_type as ProductType['productType']) || 'Pre-Loved',
    condition: (row.condition as ProductType['condition']) || 'Gently Used',
    gender: (row.gender as ProductType['gender']) || 'Unisex',
    measurements: (row.measurements as string) || (row.measurements_data as Record<string, string>) || undefined,
    makerNote: (row.maker_note as string) || undefined,
    tags,
    featured: Boolean(row.featured),
    isNewArrival: Boolean(row.is_new_arrival),
    chestPick: Boolean(row.chest_pick),
    badge: (row.badge as string) || undefined,
    sku: (row.sku as string) || undefined,
    seoTitle: (row.seo_title as string) || undefined,
    seoDescription: (row.seo_description as string) || undefined,
    status: (row.status as ProductType['status']) || (stock > 0 ? 'AVAILABLE' : 'SOLD_OUT'),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
  };
}

async function getAnyProductByIdentifier(
  identifier: string,
  client: SupabaseClient,
): Promise<IProductItem> {
  const trimmed = identifier.trim();
  if (!trimmed) throw new NotFoundError('Product identifier is required.', 'PRODUCT_NOT_FOUND');
  if (UUID_REGEX.test(trimmed)) {
    const { data, error } = await client.from('products').select('*').eq('id', trimmed).maybeSingle();
    if (error) throw new ServiceUnavailableError(`Failed to retrieve product: ${error.message}`, 'DATABASE_UNAVAILABLE');
    if (data) return mapSupabaseRowToProductItem(data);
  }
  const { data: bySerial, error: serialError } = await client
    .from('products').select('*').eq('serial_number', trimmed.toUpperCase()).maybeSingle();
  if (serialError) throw new ServiceUnavailableError(`Failed to retrieve product: ${serialError.message}`, 'DATABASE_UNAVAILABLE');
  if (bySerial) return mapSupabaseRowToProductItem(bySerial);
  const { data: bySlug, error: slugError } = await client
    .from('products').select('*').eq('slug', trimmed.toLowerCase()).maybeSingle();
  if (slugError) throw new ServiceUnavailableError(`Failed to retrieve product: ${slugError.message}`, 'DATABASE_UNAVAILABLE');
  if (!bySlug) throw new NotFoundError(`Product not found for identifier "${identifier}".`, 'PRODUCT_NOT_FOUND');
  return mapSupabaseRowToProductItem(bySlug);
}

export const supabaseCatalogService = {
  /**
   * Public product listing with filtering, searching, sorting, and pagination.
   * Public shoppers can view available and sold items, but internal statuses are excluded.
   */
  async listProducts(query: ProductListQuery, clientOverride?: SupabaseClient) {
    const client = clientOverride || getSupabaseAdminClient();
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

    let dbQuery = client
      .from('products')
      .select('*', { count: 'exact' });

    // 1. Storefront visibility gate: exclude internal back-of-house statuses
    if (inStockOnly) {
      dbQuery = dbQuery
        .gt('stock', 0)
        .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED']);
    } else {
      dbQuery = dbQuery.in('status', PUBLIC_STOREFRONT_STATUSES);
    }

    // 2. Category
    if (category && category !== 'all') {
      dbQuery = dbQuery.eq('category', category);
    }

    // 3. Subcategory
    if (subcategory && subcategory !== 'all') {
      dbQuery = dbQuery.ilike('subcategory', `%${subcategory.trim()}%`);
    }

    // 4. Condition
    if (condition && condition !== 'all') {
      dbQuery = dbQuery.eq('condition', condition);
    }

    // 5. Gender
    if (gender && gender !== 'all') {
      dbQuery = dbQuery.in('gender', [gender, 'Unisex']);
    }

    // 6. Size
    if (size && size !== 'all') {
      dbQuery = dbQuery.contains('sizes', [size]);
    }

    // 7. Price range
    if (typeof minPrice === 'number') {
      dbQuery = dbQuery.gte('price', minPrice);
    }
    if (typeof maxPrice === 'number') {
      dbQuery = dbQuery.lte('price', maxPrice);
    }

    // 8. New arrivals only
    if (newArrivalsOnly) {
      dbQuery = dbQuery.eq('is_new_arrival', true);
    }

    // 9. Featured only
    if (featuredOnly) {
      dbQuery = dbQuery.eq('featured', true);
    }

    // 10. Search query across serial number, name, description, and subcategory
    if (search && search.trim()) {
      const q = cleanFilterText(search);
      if (q) {
        dbQuery = dbQuery.or(
          `name.ilike.%${q}%,serial_number.ilike.%${q}%,description.ilike.%${q}%,subcategory.ilike.%${q}%`
        );
      }
    }

    // 11. Sorting
    if (sort === 'price-asc') {
      dbQuery = dbQuery.order('price', { ascending: true });
    } else if (sort === 'price-desc') {
      dbQuery = dbQuery.order('price', { ascending: false });
    } else {
      dbQuery = dbQuery.order('created_at', { ascending: false });
    }

    // 12. Pagination range
    dbQuery = dbQuery.range(skip, skip + limit - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      throw new ServiceUnavailableError(
        `Failed to query product catalogue: ${error.message}`,
        'DATABASE_UNAVAILABLE'
      );
    }

    const products = (data || []).map(mapSupabaseRowToProductItem);
    const total = typeof count === 'number' ? count : products.length;
    const meta = buildPaginationMeta(page, limit, total);

    return {
      products,
      total,
      page,
      limit,
      totalPages: meta.totalPages,
      hasNext: meta.hasNext,
      hasPrev: page > 1,
      meta,
    };
  },

  /**
   * Fetches a single product by serialNumber, slug, or UUID id.
   */
  async getProductByIdentifier(identifier: string, clientOverride?: SupabaseClient): Promise<IProductItem> {
    const client = clientOverride || getSupabaseAdminClient();
    const trimmed = identifier.trim();

    if (!trimmed) {
      throw new NotFoundError('Product identifier is required', 'PRODUCT_NOT_FOUND');
    }

    let row: Record<string, unknown> | null = null;
    if (UUID_REGEX.test(trimmed)) {
      const { data, error } = await client.from('products').select('*').eq('id', trimmed).maybeSingle();
      if (error) throw new ServiceUnavailableError(`Failed to retrieve product: ${error.message}`, 'DATABASE_UNAVAILABLE');
      row = data;
    }
    if (!row) {
      const { data, error } = await client.from('products').select('*').eq('serial_number', trimmed.toUpperCase()).maybeSingle();
      if (error) throw new ServiceUnavailableError(`Failed to retrieve product: ${error.message}`, 'DATABASE_UNAVAILABLE');
      row = data;
    }
    if (!row) {
      const { data, error } = await client.from('products').select('*').eq('slug', trimmed.toLowerCase()).maybeSingle();
      if (error) throw new ServiceUnavailableError(`Failed to retrieve product: ${error.message}`, 'DATABASE_UNAVAILABLE');
      row = data;
    }
    if (!row) throw new NotFoundError(`Product not found for identifier "${identifier}"`, 'PRODUCT_NOT_FOUND');

    const status = String(row.status || '').toUpperCase();
    if (INTERNAL_HIDDEN_STATUSES.includes(status)) {
      throw new NotFoundError(
        `Product "${identifier}" is not currently available.`,
        'PRODUCT_NOT_FOUND'
      );
    }

    return mapSupabaseRowToProductItem(row);
  },

  /**
   * Retrieves related products in the same category, excluding the target product.
   */
  async getRelatedProducts(identifier: string, limit = 4, clientOverride?: SupabaseClient): Promise<IProductItem[]> {
    const client = clientOverride || getSupabaseAdminClient();
    const target = await this.getProductByIdentifier(identifier, clientOverride);

    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('category', target.category)
      .neq('id', target.id)
      .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceUnavailableError(
        `Failed to retrieve related products: ${error.message}`,
        'DATABASE_UNAVAILABLE'
      );
    }

    const items = (data || []).map(mapSupabaseRowToProductItem);

    // If fewer than requested limit, backfill with general published products
    if (items.length < limit) {
      const remainingLimit = limit - items.length;
      const excludedIds = [target.id, ...items.map((it) => it.id)];
      const { data: fallbackData, error: fallbackError } = await client
        .from('products')
        .select('*')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED'])
        .order('created_at', { ascending: false })
        .limit(remainingLimit);

      if (fallbackError) throw new ServiceUnavailableError(`Failed to retrieve related products: ${fallbackError.message}`, 'DATABASE_UNAVAILABLE');
      if (fallbackData) items.push(...fallbackData.map(mapSupabaseRowToProductItem));
    }

    return items;
  },

  /**
   * Fetches 4-6 chest picks for 3D treasure chest on the homepage.
   */
  async findChestPicks(clientOverride?: SupabaseClient): Promise<IProductItem[]> {
    const client = clientOverride || getSupabaseAdminClient();

    // 1. Primary: explicitly tagged chest_pick = true
    const { data: chestData, error: chestError } = await client
      .from('products')
      .select('*')
      .eq('chest_pick', true)
      .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED'])
      .order('created_at', { ascending: false })
      .limit(6);

    if (chestError) {
      throw new ServiceUnavailableError(
        `Failed to fetch chest picks: ${chestError.message}`,
        'DATABASE_UNAVAILABLE'
      );
    }

    const picks = (chestData || []).map(mapSupabaseRowToProductItem);
    if (picks.length > 0) {
      if (picks.length >= 6) {
        return picks.slice(0, 6);
      }
      // If 1-5 products are picked, pad remaining slots with active products not already in picks
      const existingIds = new Set(picks.map((p) => p.id));
      const remainingSlots = 6 - picks.length;
      const { data: fallbackData, error: fallbackError } = await client
        .from('products')
        .select('*')
        .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED'])
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(remainingSlots + picks.length);

      if (fallbackError) throw new ServiceUnavailableError(`Failed to retrieve chest picks: ${fallbackError.message}`, 'DATABASE_UNAVAILABLE');
      const extra = (fallbackData || [])
        .map(mapSupabaseRowToProductItem)
        .filter((p) => !existingIds.has(p.id))
        .slice(0, remainingSlots);

      return [...picks, ...extra];
    }

    // 2. Fallback: featured active products if zero explicitly tagged
    const { data: featuredData, error: featuredError } = await client
      .from('products')
      .select('*')
      .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED'])
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6);

    if (featuredError) throw new ServiceUnavailableError(`Failed to retrieve featured products: ${featuredError.message}`, 'DATABASE_UNAVAILABLE');
    return (featuredData || []).map(mapSupabaseRowToProductItem);
  },

  /**
   * Fetches collection row products for homepage sections (ready-to-wear, handbags).
   */
  async findCollectionRow(category: string, limit = 4, clientOverride?: SupabaseClient): Promise<IProductItem[]> {
    const client = clientOverride || getSupabaseAdminClient();

    const { data, error } = await client
      .from('products')
      .select('*')
      .or(`category.eq.${cleanFilterText(category)},tags.cs.{${cleanFilterText(category)}}`)
      .in('status', ['AVAILABLE', 'ACTIVE', 'PUBLISHED'])
      .order('is_new_arrival', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceUnavailableError(
        `Failed to fetch collection row for category "${category}": ${error.message}`,
        'DATABASE_UNAVAILABLE'
      );
    }

    return (data || []).map(mapSupabaseRowToProductItem);
  },

  /**
   * Admin product listing. Supports viewing all statuses (DRAFT, ARCHIVED, etc.)
   */
  async listAdminProducts(
    query: ProductListQuery & { includeArchived?: boolean; includeDeleted?: boolean },
    clientOverride?: SupabaseClient
  ) {
    const client = clientOverride || getSupabaseAdminClient();
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
    const skip = (page - 1) * limit;

    let dbQuery = client
      .from('products')
      .select('*', { count: 'exact' });

    if (!query.includeArchived && !query.includeDeleted) {
      dbQuery = dbQuery.neq('status', 'ARCHIVED');
    }

    if (query.category && query.category !== 'all') {
      dbQuery = dbQuery.eq('category', query.category);
    }

    if (query.search && query.search.trim()) {
      const q = cleanFilterText(query.search);
      if (q) {
        dbQuery = dbQuery.or(
          `name.ilike.%${q}%,serial_number.ilike.%${q}%,slug.ilike.%${q}%`
        );
      }
    }

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(skip, skip + limit - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      throw new ServiceUnavailableError(
        `Failed to retrieve admin products: ${error.message}`,
        'DATABASE_UNAVAILABLE'
      );
    }

    const products = (data || []).map(mapSupabaseRowToProductItem);
    const total = typeof count === 'number' ? count : products.length;

    return {
      products,
      total,
      page,
      limit,
    };
  },

  /**
   * Admin product creation in Supabase.
   */
  async createProduct(data: Partial<ProductType>, clientOverride?: SupabaseClient): Promise<IProductItem> {
    const client = clientOverride || getSupabaseAdminClient();

    if (!data.name) throw new BadRequestError('Product name is required.', 'NAME_REQUIRED');
    if (typeof data.price !== 'number' || !Number.isSafeInteger(data.price) || data.price < 0) {
      throw new BadRequestError('Valid product price in paise is required.', 'INVALID_PRICE');
    }
    if (data.stock !== undefined && (!Number.isInteger(data.stock) || data.stock < 0)) {
      throw new BadRequestError('Valid non-negative product stock is required.', 'INVALID_STOCK');
    }

    let serialNumber = data.serialNumber?.trim().toUpperCase();
    if (!serialNumber) {
      const { count, error: countError } = await client.from('products').select('*', { count: 'exact', head: true });
      if (countError) throw new ServiceUnavailableError(`Failed to create product serial number: ${countError.message}`, 'DATABASE_ERROR');
      serialNumber = `CU-${String((count || 0) + 1).padStart(3, '0')}`;
    }

    const slug =
      data.slug?.trim().toLowerCase() ||
      `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${serialNumber.toLowerCase()}`;

    const catCode = data.categoryCode || extractCategoryCodeFromSerial(serialNumber);

    const rowToInsert = buildProductRow(data, serialNumber, slug, catCode);

    const { data: inserted, error } = await client
      .from('products')
      .insert(rowToInsert)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestError('Serial number or slug already in use.', 'DUPLICATE_PRODUCT');
      }
      throw new ServiceUnavailableError(`Failed to create product: ${error.message}`, 'DATABASE_ERROR');
    }

    return mapSupabaseRowToProductItem(inserted);
  },

  /** Seeds only the supplied products and reports failure if Supabase did not persist them. */
  async seedProducts(products: Array<Partial<ProductType>>, clientOverride?: SupabaseClient): Promise<number> {
    const client = clientOverride || getSupabaseAdminClient();
    if (products.length === 0) return 0;
    const rows = products.map((product, index) => {
      if (!product.name || typeof product.price !== 'number' || !Number.isSafeInteger(product.price) || product.price < 0) {
        throw new BadRequestError(`Seed product at position ${index + 1} has invalid name or price.`, 'INVALID_PRODUCT');
      }
      const serial = product.serialNumber?.trim().toUpperCase();
      if (!serial) throw new BadRequestError(`Seed product at position ${index + 1} has no serial number.`, 'INVALID_SERIAL_NUMBER');
      const slug = product.slug?.trim().toLowerCase() || `${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${serial.toLowerCase()}`;
      return buildProductRow(product, serial, slug, product.categoryCode || extractCategoryCodeFromSerial(serial));
    });
    const { data, error } = await client
      .from('products')
      .upsert(rows, { onConflict: 'serial_number' })
      .select('id');
    if (error) {
      throw new ServiceUnavailableError(`Failed to seed products: ${error.message}`, 'DATABASE_ERROR');
    }
    if (!Array.isArray(data) || data.length !== rows.length) {
      throw new ServiceUnavailableError('Supabase did not confirm persistence of every seed product.', 'DATABASE_ERROR');
    }
    return data.length;
  },

  /**
   * Admin product update in Supabase.
   */
  async updateProduct(id: string, updates: Partial<ProductType>, clientOverride?: SupabaseClient): Promise<IProductItem> {
    const client = clientOverride || getSupabaseAdminClient();
    const trimmed = id.trim();

    const rowUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) rowUpdates.name = updates.name;
    if (updates.slug !== undefined) rowUpdates.slug = updates.slug;
    if (updates.description !== undefined) rowUpdates.description = updates.description;
    if (updates.price !== undefined) rowUpdates.price = normalizePriceToPaise(updates.price);
    if (updates.originalPrice !== undefined) rowUpdates.original_price = updates.originalPrice != null ? normalizePriceToPaise(updates.originalPrice) : null;
    if (updates.compareAtPrice !== undefined) rowUpdates.compare_at_price = updates.compareAtPrice != null ? normalizePriceToPaise(updates.compareAtPrice) : null;
    if (updates.stock !== undefined) {
      rowUpdates.stock = updates.stock;
      if (updates.stock === 0) rowUpdates.status = 'SOLD_OUT';
      else if (updates.status === undefined) rowUpdates.status = 'ACTIVE';
    }
    if (updates.images !== undefined) rowUpdates.images = updates.images;
    if (updates.sizes !== undefined) rowUpdates.sizes = updates.sizes;
    if (updates.variants !== undefined) rowUpdates.variants = updates.variants;
    if (updates.category !== undefined) rowUpdates.category = updates.category;
    if (updates.categoryLabel !== undefined) rowUpdates.category_label = updates.categoryLabel;
    if (updates.categoryCode !== undefined) rowUpdates.category_code = updates.categoryCode;
    if (updates.sizeCategory !== undefined) rowUpdates.size_category = updates.sizeCategory;
    if (updates.measurements !== undefined) {
      rowUpdates.measurements = typeof updates.measurements === 'string' ? updates.measurements : null;
      if (typeof updates.measurements === 'object' && updates.measurements !== null) {
        rowUpdates.measurements_data = updates.measurements;
      }
    }
    const measurementsData = (updates as Partial<ProductType> & { measurementsData?: Record<string, string> }).measurementsData;
    if (measurementsData !== undefined) rowUpdates.measurements_data = measurementsData;
    if (updates.makerNote !== undefined) rowUpdates.maker_note = updates.makerNote;
    if (updates.subcategory !== undefined) rowUpdates.subcategory = updates.subcategory;
    if (updates.productType !== undefined) rowUpdates.product_type = updates.productType;
    if (updates.condition !== undefined) rowUpdates.condition = updates.condition;
    if (updates.gender !== undefined) rowUpdates.gender = updates.gender;
    if (updates.badge !== undefined) rowUpdates.badge = updates.badge;
    if (updates.sku !== undefined) rowUpdates.sku = updates.sku;
    if (updates.seoTitle !== undefined) rowUpdates.seo_title = updates.seoTitle;
    if (updates.seoDescription !== undefined) rowUpdates.seo_description = updates.seoDescription;
    if (updates.tags !== undefined) rowUpdates.tags = updates.tags;
    if (updates.featured !== undefined) rowUpdates.featured = updates.featured;
    if (updates.chestPick !== undefined) rowUpdates.chest_pick = updates.chestPick;
    if (updates.isNewArrival !== undefined) rowUpdates.is_new_arrival = updates.isNewArrival;
    if (updates.status !== undefined) rowUpdates.status = updates.status;
    if (updates.serialNumber !== undefined && updates.serialNumber.trim()) {
      rowUpdates.serial_number = updates.serialNumber.trim().toUpperCase();
      if (updates.categoryCode === undefined) {
        const derivedCode = extractCategoryCodeFromSerial(rowUpdates.serial_number as string);
        if (derivedCode) rowUpdates.category_code = derivedCode;
      }
    }

    const existing = await getAnyProductByIdentifier(trimmed, client);
    const { data: updated, error } = await client
      .from('products')
      .update(rowUpdates)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') throw new BadRequestError('Serial number or slug already in use.', 'DUPLICATE_PRODUCT');
      throw new ServiceUnavailableError(`Failed to update product: ${error.message}`, 'DATABASE_ERROR');
    }
    if (!updated) throw new NotFoundError(`Product "${id}" not found.`, 'PRODUCT_NOT_FOUND');
    return mapSupabaseRowToProductItem(updated);
  },

  /**
   * Fetches an authoritative admin product item by UUID, serialNumber, or slug,
   * without suppressing internal or hidden statuses (DRAFT, ARCHIVED, NEED_ATTENTION, MISSING).
   */
  async getAdminProduct(identifier: string, clientOverride?: SupabaseClient): Promise<IProductItem> {
    const client = clientOverride || getSupabaseAdminClient();
    return getAnyProductByIdentifier(identifier, client);
  },

  /**
   * Duplicates an existing product with a fresh serial number, slug and DRAFT status.
   */
  async duplicateProduct(id: string, clientOverride?: SupabaseClient): Promise<IProductItem> {
    const client = clientOverride || getSupabaseAdminClient();
    const source = await this.getProductByIdentifier(id, client);
    const { count, error } = await client.from('products').select('*', { count: 'exact', head: true });
    if (error) throw new ServiceUnavailableError(`Failed to count products: ${error.message}`, 'DATABASE_ERROR');
    const newSerial = `CU-${String((count || 0) + 1).padStart(3, '0')}`;
    const newName = `${source.name} (Copy)`;
    const newSlug = `${source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-copy-${newSerial.toLowerCase()}`;
    return this.createProduct({ ...source, serialNumber: newSerial, name: newName, slug: newSlug, status: 'DRAFT', stock: 1 }, client);
  },

  /**
   * Soft deletes a product by archiving it.
   */
  async softDeleteProduct(id: string, clientOverride?: SupabaseClient): Promise<{ message: string }> {
    const client = clientOverride || getSupabaseAdminClient();
    const product = await this.updateProduct(id, { status: 'ARCHIVED' }, client);
    return { message: `Product ${product.serialNumber} soft-deleted successfully.` };
  },

  async restoreProduct(id: string, clientOverride?: SupabaseClient): Promise<{ message: string }> {
    const client = clientOverride || getSupabaseAdminClient();
    const product = await this.updateProduct(id, { status: 'PUBLISHED' }, client);
    return { message: `Product ${product.serialNumber} restored successfully.` };
  },

  /**
   * Bulk action on multiple product IDs or serial numbers.
   */
  async bulkAction(
    action: 'publish' | 'unpublish' | 'archive' | 'changeCategory' | 'delete',
    ids: string[],
    payload?: { category?: string },
    clientOverride?: SupabaseClient
  ): Promise<{ modifiedCount: number }> {
    const client = clientOverride || getSupabaseAdminClient();
    if (!ids || ids.length === 0) return { modifiedCount: 0 };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === 'publish') update.status = 'PUBLISHED';
    else if (action === 'unpublish') update.status = 'DRAFT';
    else if (action === 'archive' || action === 'delete') update.status = 'ARCHIVED';
    else if (action === 'changeCategory' && payload?.category) update.category = payload.category;
    const uuids = ids.filter((value) => UUID_REGEX.test(value.trim()));
    const serials = ids.filter((value) => !UUID_REGEX.test(value.trim())).map((value) => value.trim().toUpperCase());
    let modifiedCount = 0;
    if (uuids.length) {
      const { data, error } = await client.from('products').update(update).in('id', uuids).select('id');
      if (error) throw new ServiceUnavailableError(`Failed to bulk update products: ${error.message}`, 'DATABASE_ERROR');
      modifiedCount += data?.length || 0;
    }
    if (serials.length) {
      const { data, error } = await client.from('products').update(update).in('serial_number', serials).select('id');
      if (error) throw new ServiceUnavailableError(`Failed to bulk update products: ${error.message}`, 'DATABASE_ERROR');
      modifiedCount += data?.length || 0;
    }
    return { modifiedCount };
  },

  /** Permanently deletes only when no order item references the product. */
  async permanentDeleteProduct(id: string, clientOverride?: SupabaseClient): Promise<{ message: string }> {
    const client = clientOverride || getSupabaseAdminClient();
    const product = await getAnyProductByIdentifier(id, client);
    const { data, error } = await client.rpc('delete_product_if_unordered', { p_product_id: product.id });
    if (error) {
      if (error.code === '23503' || error.message?.includes('PRODUCT_IN_ORDERS')) {
        throw new BadRequestError(`Cannot permanently delete product ${product.serialNumber} because it exists in existing orders. Soft-delete (archive) instead to preserve customer audit trail.`, 'PRODUCT_IN_ORDERS');
      }
      if (error.code === 'P0002' || error.message?.includes('PRODUCT_NOT_FOUND')) {
        throw new NotFoundError(`Product "${id}" not found.`, 'PRODUCT_NOT_FOUND');
      }

      const isMissingRpc =
        error.code === 'PGRST202' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('delete_product_if_unordered') ||
        error.message?.includes('does not exist');

      if (isMissingRpc) {
        // Safe fallback when RPC is not in schema cache:
        // 1. Verify product has no references in order_items (by product_id or serial_number)
        const { data: orderRefs, error: orderCheckErr } = await client
          .from('order_items')
          .select('id')
          .or(`product_id.eq.${product.id},serial_number.ilike.${product.serialNumber.trim()}`)
          .limit(1);

        if (orderCheckErr) {
          throw new ServiceUnavailableError(`Failed to verify product order history: ${orderCheckErr.message}`, 'DATABASE_ERROR');
        }

        if (orderRefs && orderRefs.length > 0) {
          throw new BadRequestError(
            `Cannot permanently delete product ${product.serialNumber} because it exists in existing orders. Soft-delete (archive) instead to preserve customer audit trail.`,
            'PRODUCT_IN_ORDERS',
          );
        }

        // 2. Verify product has no active stock reservations
        const { data: reservationRefs, error: resCheckErr } = await client
          .from('stock_reservations')
          .select('id')
          .eq('product_id', product.id)
          .limit(1);

        if (!resCheckErr && reservationRefs && reservationRefs.length > 0) {
          throw new BadRequestError(
            `Cannot permanently delete product ${product.serialNumber} because it is referenced in stock reservations.`,
            'PRODUCT_IN_ORDERS',
          );
        }

        // 3. Atomically delete the row from products
        const { data: deleted, error: delErr } = await client
          .from('products')
          .delete()
          .eq('id', product.id)
          .select('id, serial_number');

        if (delErr) {
          if (delErr.code === '23503') {
            throw new BadRequestError(
              `Cannot permanently delete product ${product.serialNumber} because it is referenced by existing orders.`,
              'PRODUCT_IN_ORDERS',
            );
          }
          throw new ServiceUnavailableError(`Failed to delete product: ${delErr.message}`, 'DATABASE_ERROR');
        }

        if (!deleted || deleted.length === 0) {
          throw new NotFoundError(`Product "${id}" not found.`, 'PRODUCT_NOT_FOUND');
        }

        return { message: `Product ${product.serialNumber} permanently removed.` };
      }

      throw new ServiceUnavailableError(`Failed to delete product: ${error.message}`, 'DATABASE_ERROR');
    }
    if (!Array.isArray(data) || data.length !== 1) {
      throw new ServiceUnavailableError('Supabase did not confirm product deletion.', 'DATABASE_ERROR');
    }
    return { message: `Product ${product.serialNumber} permanently removed.` };
  },

  /** Retrieves item counts by category for active/published products. */
  async getCategoryCounts(clientOverride?: SupabaseClient): Promise<Map<string, number>> {
    const client = clientOverride || getSupabaseAdminClient();
    const countMap = new Map<string, number>();
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client.from('products').select('category')
        .in('status', ['ACTIVE', 'PUBLISHED']).range(offset, offset + pageSize - 1);
      if (error) throw new ServiceUnavailableError(`Failed to fetch category counts: ${error.message}`, 'DATABASE_ERROR');
      for (const row of data || []) {
        const cat = (row.category as string) || '';
        countMap.set(cat, (countMap.get(cat) || 0) + 1);
      }
      if (!data || data.length < pageSize) break;
    }
    return countMap;
  },

  /**
   * Retrieves active/published products formatted for search ranking.
   */
  async searchCatalogItems(clientOverride?: SupabaseClient) {
    const client = clientOverride || getSupabaseAdminClient();
    const rows: Array<Record<string, unknown>> = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client
        .from('products')
        .select('id, serial_number, name, description, slug, category, category_label, price, images, tags, subcategory')
        .in('status', ['ACTIVE', 'PUBLISHED'])
        .range(offset, offset + pageSize - 1);
      if (error) throw new ServiceUnavailableError(`Failed to fetch products for search: ${error.message}`, 'DATABASE_ERROR');
      rows.push(...(data || []) as Array<Record<string, unknown>>);
      if (!data || data.length < pageSize) break;
    }
    return rows.map((row) => ({
      id: String(row.id),
      serialNumber: String(row.serial_number || ''),
      name: String(row.name || ''),
      description: String(row.description || ''),
      slug: String(row.slug || ''),
      category: String(row.category || ''),
      categoryLabel: (row.category_label as string) || undefined,
      price: Number(row.price || 0),
      images: Array.isArray(row.images) ? (row.images as string[]) : [],
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      subcategory: (row.subcategory as string) || undefined,
    }));
  },

  /**
   * Restores product stock (e.g. after order cancellation).
   */
  async restoreStock(serialNumber: string, quantity: number, clientOverride?: SupabaseClient): Promise<void> {
    const client = clientOverride || getSupabaseAdminClient();
    const product = await this.getProductByIdentifier(serialNumber, client);
    const newStock = product.stock + quantity;
    const targetId = product.id || product.serialNumber;
    await this.updateProduct(targetId, { stock: newStock, status: 'ACTIVE' }, client);
  },
};
