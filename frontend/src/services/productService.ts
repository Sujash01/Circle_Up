import { CATEGORIES, CATEGORY_MAP } from '@/data/categories';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { apiClient } from '@/services/apiClient';
import type {
  CategoryMeta,
  GenderTag,
  Product,
  ProductCategorySlug,
  ProductCondition,
} from '@/types/storefront';

export type ProductSortOption = 'newest' | 'price-asc' | 'price-desc';

export interface ProductQueryParams {
  category?: ProductCategorySlug | 'all';
  subcategory?: string;
  size?: string;
  condition?: ProductCondition | 'all';
  gender?: GenderTag | 'all';
  maxPrice?: number;
  inStockOnly?: boolean;
  newArrivalsOnly?: boolean;
  brandNewOnly?: boolean;
  thriftedOnly?: boolean;
  search?: string;
  sort?: ProductSortOption;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// Tracks whether a live database connection is active
let liveDatabaseConnected = false;

// Production-ready in-memory reactive product cache (starts empty for production data)
let productCache: Product[] = [];

// Listeners for catalog state updates
const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/**
 * Maps a Supabase `products` table row into the frontend `Product` domain model.
 */
function mapSupabaseRowToProduct(row: Record<string, unknown>): Product {
  const stock = Number(row.stock ?? 1);
  const images = Array.isArray(row.images) ? (row.images as string[]) : [];
  const sizes = Array.isArray(row.sizes) ? (row.sizes as string[]) : [];
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];

  return {
    id: (row.id as string) || (row.serial_number as string) || 'cu-unknown',
    serialNumber: (row.serial_number as string) || (row.id as string)?.toUpperCase(),
    name: (row.name as string) || 'Untitled Piece',
    slug: (row.slug as string) || normalizeToken((row.name as string) || 'untitled-piece'),
    description: (row.description as string) || '',
    price: Number(row.price || 0),
    originalPrice: row.original_price
      ? Number(row.original_price)
      : row.compare_at_price
        ? Number(row.compare_at_price)
        : undefined,
    stock,
    images,
    sizes,
    variants: Array.isArray(row.variants) ? (row.variants as Product['variants']) : [],
    category: (row.category as ProductCategorySlug) || 'thrifted-treasure',
    categoryLabel: (row.category_label as string) || (row.category as string) || 'Curated Piece',
    subcategory: (row.subcategory as string) || '',
    productType: (row.product_type as Product['productType']) || 'Pre-Loved',
    condition: (row.condition as ProductCondition) || 'Gently Used',
    gender: (row.gender as GenderTag) || 'Unisex',
    measurements: (row.measurements as string) || undefined,
    makerNote: (row.maker_note as string) || undefined,
    tags,
    featured: Boolean(row.featured),
    isNewArrival: Boolean(row.is_new_arrival),
    availability: stock > 0 ? (stock <= 2 ? 'Low Stock' : 'In Stock') : 'Sold Out',
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export const productService = {
  subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  isDatabaseLive(): boolean {
    return liveDatabaseConnected;
  },

  /**
   * Directly sets the in-memory product cache (used for unit tests and local mock fixtures).
   */
  setProducts(products: Product[]): void {
    productCache = products;
    liveDatabaseConnected = true;
    notifyListeners();
  },

  /**
   * Initializes live catalog sync from Supabase database or backend API.
   * If the connected database is empty, productCache remains empty ([])
   * so no demo products are displayed.
   */
  async initLiveSync(): Promise<void> {
    try {
      // 1. Try Supabase direct query if configured
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .in('status', ['ACTIVE', 'PUBLISHED'])
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          productCache = data.map(mapSupabaseRowToProduct);
          liveDatabaseConnected = true;
          notifyListeners();
          return;
        }
      }

      // 2. Fallback to REST API /products endpoint
      const response = await apiClient
        .get<{ success: true; data: Array<Record<string, unknown>> }>('/products?limit=100')
        .catch(() => null);

      if (response?.data?.success && Array.isArray(response.data.data)) {
        productCache = response.data.data.map(mapSupabaseRowToProduct);
        liveDatabaseConnected = true;
        notifyListeners();
      }
    } catch {
      // Offline fallback: retains current cache state
    }
  },

  clearCatalog(): void {
    productCache = [];
    liveDatabaseConnected = true;
    notifyListeners();
  },

  getCategories(): CategoryMeta[] {
    return CATEGORIES;
  },

  getCategoryMeta(slug: ProductCategorySlug): CategoryMeta | undefined {
    return CATEGORY_MAP[slug];
  },

  getAllProducts(): Product[] {
    return productCache;
  },

  getProductBySlug(slug: string): Product | undefined {
    const slugLower = slug.toLowerCase();
    return productCache.find(
      (item) =>
        item.slug.toLowerCase() === slugLower ||
        item.serialNumber?.toLowerCase() === slugLower ||
        item.id.toLowerCase() === slugLower,
    );
  },

  getProductById(id: string): Product | undefined {
    return productCache.find(
      (item) =>
        item.id === id ||
        item.serialNumber?.toUpperCase() === id.toUpperCase(),
    );
  },

  getRelatedProducts(product: Product, limit = 4): Product[] {
    const sameCategory = productCache.filter(
      (item) => item.id !== product.id && item.category === product.category,
    );
    if (sameCategory.length >= limit) {
      return sameCategory.slice(0, limit);
    }
    const others = productCache.filter(
      (item) => item.id !== product.id && item.category !== product.category,
    );
    return [...sameCategory, ...others].slice(0, limit);
  },

  queryProducts(params: ProductQueryParams = {}): Product[] {
    const {
      category = 'all',
      subcategory = 'all',
      size = 'all',
      condition = 'all',
      gender = 'all',
      maxPrice,
      inStockOnly = false,
      newArrivalsOnly = false,
      brandNewOnly = false,
      thriftedOnly = false,
      search = '',
      sort = 'newest',
    } = params;

    const searchLower = search.trim().toLowerCase();
    const subToken = subcategory !== 'all' ? normalizeToken(subcategory) : '';

    const filtered = productCache.filter((product) => {
      if (category !== 'all' && product.category !== category) {
        return false;
      }
      if (newArrivalsOnly && !product.isNewArrival) {
        return false;
      }
      if (brandNewOnly) {
        const isBrandNew =
          product.productType === 'Fresh Find' ||
          product.productType === 'Handcrafted' ||
          product.condition === 'New With Tags' ||
          product.condition === 'Mint' ||
          product.condition === 'Artisan Made' ||
          product.isNewArrival;
        if (!isBrandNew) {
          return false;
        }
      }
      if (thriftedOnly) {
        const isThrifted =
          product.productType === 'Pre-Loved' ||
          product.condition === 'Gently Used' ||
          product.condition === 'Vintage Wear' ||
          product.category === 'thrifted-treasure' ||
          product.tags.some((t) =>
            ['vintage', 'pre-loved', 'thrift', 'thrifted', 'treasure', 'one-of-a-kind'].includes(t.toLowerCase()),
          );
        if (!isThrifted) {
          return false;
        }
      }
      if (subToken) {
        const matchesSub = normalizeToken(product.subcategory) === subToken;
        const matchesTag = product.tags.some((t) => normalizeToken(t) === subToken);
        if (!matchesSub && !matchesTag) {
          return false;
        }
      }
      if (size !== 'all' && !product.sizes.includes(size)) {
        return false;
      }
      if (condition !== 'all' && product.condition !== condition) {
        return false;
      }
      if (gender !== 'all') {
        if (product.gender !== gender && product.gender !== 'Unisex') {
          return false;
        }
      }
      if (typeof maxPrice === 'number' && maxPrice > 0 && product.price > maxPrice) {
        return false;
      }
      if (inStockOnly && product.stock <= 0) {
        return false;
      }
      if (searchLower) {
        const haystack = [
          product.serialNumber,
          product.name,
          product.categoryLabel,
          product.subcategory,
          product.description,
          ...product.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  },

  getBrandNewProducts(params: Omit<ProductQueryParams, 'brandNewOnly' | 'thriftedOnly'> = {}): Product[] {
    return this.queryProducts({ ...params, brandNewOnly: true });
  },

  getThriftedProducts(params: Omit<ProductQueryParams, 'brandNewOnly' | 'thriftedOnly'> = {}): Product[] {
    return this.queryProducts({ ...params, thriftedOnly: true });
  },

  async addProduct(newProduct: Partial<Product>): Promise<Product> {
    const response = await apiClient.post<{ success: true; data: Product }>('/products', newProduct);
    const saved = response.data.data;
    productCache = [saved, ...productCache];
    notifyListeners();
    return saved;
  },

  async updateProduct(serialNumber: string, updates: Partial<Product>): Promise<Product> {
    const response = await apiClient.put<{ success: true; data: Product }>(`/products/${serialNumber}`, updates);
    const updated = response.data.data;
    productCache = productCache.map((p) => (p.serialNumber === serialNumber ? updated : p));
    notifyListeners();
    return updated;
  },
};

// Initial live sync deferred after client hydration/idle (skipped during unit tests)
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
      () => void productService.initLiveSync(),
      { timeout: 3000 },
    );
  } else {
    setTimeout(() => void productService.initLiveSync(), 600);
  }
}
