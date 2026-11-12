import { CATEGORIES, CATEGORY_MAP } from '@/data/categories';
import { PRODUCTS } from '@/data/products';
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
  search?: string;
  sort?: ProductSortOption;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// Tracks whether a live MongoDB database is connected
let liveDatabaseConnected = false;

// In-memory reactive product cache initialized with curated seed data for offline preview
let productCache: Product[] = PRODUCTS.map((p) => ({
  ...p,
  serialNumber: p.serialNumber || p.id.toUpperCase(),
}));

// Listeners for catalog state updates
const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export const productService = {
  subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  isDatabaseLive(): boolean {
    return liveDatabaseConnected;
  },

  async initLiveSync(): Promise<void> {
    try {
      // 1. Check if backend database is connected
      const healthRes = await apiClient.get<{
        success: true;
        data: { db: string };
      }>('/health').catch(() => null);

      const isDbLive = healthRes?.data?.data?.db === 'connected';

      // 2. Query products from API
      const response = await apiClient.get<{ success: true; data: Product[] }>('/products?limit=100');

      if (response.data?.success && Array.isArray(response.data.data)) {
        if (isDbLive) {
          // Live database connected! Replace demo cache with database items (even if empty [])
          // This ensures demo products disappear to make space for the user's actual items.
          productCache = response.data.data.map((item) => ({
            ...item,
            id: item.id || item.serialNumber || (item as unknown as { _id?: string })._id || 'cu-unknown',
            serialNumber: item.serialNumber || item.id?.toUpperCase() || 'CU-UNKNOWN',
          }));
          liveDatabaseConnected = true;
          notifyListeners();
        } else if (response.data.data.length > 0) {
          productCache = response.data.data.map((item) => ({
            ...item,
            id: item.id || item.serialNumber || (item as unknown as { _id?: string })._id || 'cu-unknown',
            serialNumber: item.serialNumber || item.id?.toUpperCase() || 'CU-UNKNOWN',
          }));
          notifyListeners();
        }
      }
    } catch {
      // Offline fallback
    }
  },

  clearDemoCatalog(): void {
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

// Initial sync triggered upon client load (skipped during unit tests)
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  void productService.initLiveSync();
}
