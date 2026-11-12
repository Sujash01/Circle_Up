import { CATEGORIES, CATEGORY_MAP } from '@/data/categories';
import { PRODUCTS } from '@/data/products';
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

export const productService = {
  getCategories(): CategoryMeta[] {
    return CATEGORIES;
  },

  getCategoryMeta(slug: ProductCategorySlug): CategoryMeta | undefined {
    return CATEGORY_MAP[slug];
  },

  getAllProducts(): Product[] {
    return PRODUCTS;
  },

  getProductBySlug(slug: string): Product | undefined {
    return PRODUCTS.find((item) => item.slug === slug);
  },

  getProductById(id: string): Product | undefined {
    return PRODUCTS.find((item) => item.id === id);
  },

  getRelatedProducts(product: Product, limit = 4): Product[] {
    const sameCategory = PRODUCTS.filter(
      (item) => item.id !== product.id && item.category === product.category,
    );
    if (sameCategory.length >= limit) {
      return sameCategory.slice(0, limit);
    }
    const others = PRODUCTS.filter(
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

    const filtered = PRODUCTS.filter((product) => {
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
        // Unisex pieces appear under both Women and Men filters unless explicitly excluding
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
};

