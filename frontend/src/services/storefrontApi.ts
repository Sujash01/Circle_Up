import axios, { type AxiosRequestConfig } from 'axios';
import { normalizeApiError } from './apiClient';
import { couponValidateResultSchema, storefrontSettingsSchema, type StorefrontSettings } from '@circleup/shared';
import type {
  CouponValidateResult,
  Order,
  Product,
} from '@circleup/shared';

export interface HomepagePayload {
  chestPicks: Array<{
    id: string;
    name: string;
    price: string;
    rawPrice: number;
    tag: string;
    bg: [string, string];
    img: string;
    to: string;
  }>;
  collections: {
    readyToWear: Array<{
      id: string;
      img: string;
      name: string;
      price: string;
      rawPrice: number;
      to: string;
      category: string;
    }>;
    handbags: Array<{
      id: string;
      img: string;
      name: string;
      price: string;
      rawPrice: number;
      to: string;
      category: string;
    }>;
    winter: Array<{
      img: string;
      alt: string;
    }>;
  };
  categoryTiles: Array<{
    to: string;
    title: string;
    note: string;
    img: string;
    alt: string;
  }>;
  announcementText: string;
  marqueePhrases: string[];
  customDrop?: {
    label: string;
    to: string;
    badge?: string;
    description?: string;
    enabled: boolean;
  };
  siteSettings: {
    storeAddress: string;
    contactEmail: string;
    contactPhone: string;
    whatsappNumber: string;
    contentVersion: number;
  };
}

// === TINY STALE-WHILE-REVALIDATE CACHE ===
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  maxAgeMs: number;
  staleWhileRevalidateMs: number;
}

const swrCache = new Map<string, CacheEntry<unknown>>();

export function clearStorefrontCache() {
  swrCache.clear();
}

/**
 * Executes an idempotent GET request with a lightweight Stale-While-Revalidate cache
 * and up to 2 retries for transient failures.
 */
async function fetchWithSwr<T>(
  url: string,
  options: {
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    maxAgeMs?: number;
    staleMs?: number;
    retries?: number;
  } = {},
): Promise<T> {
  const {
    params,
    signal,
    maxAgeMs = 30_000, // 30 seconds fresh
    staleMs = 300_000, // 5 minutes stale-while-revalidate
    retries = 2,
  } = options;

  const cacheKey = `${url}?${new URLSearchParams(params as Record<string, string>).toString()}`;
  const now = Date.now();
  const cached = swrCache.get(cacheKey) as CacheEntry<T> | undefined;

  // 1. Return immediate cache if within freshness window
  if (cached && now - cached.timestamp < cached.maxAgeMs) {
    return cached.data;
  }

  // 2. Fetch fresh network data with retry for idempotent GET
  const fetchNetwork = async (attemptsLeft: number): Promise<T> => {
    try {
      const config: AxiosRequestConfig = {
        params,
        signal,
        timeout: 12000,
      };
      const res = await axios.get<{ success: true; data: T }>(url, config);
      if (!res.data || typeof res.data !== 'object' || !('data' in res.data)) {
        throw new Error('Invalid JSON API response shape');
      }
      const data = res.data.data;
      swrCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        maxAgeMs,
        staleWhileRevalidateMs: staleMs,
      });
      return data;
    } catch (err) {
      if (axios.isCancel(err) || (err as { name?: string }).name === 'CanceledError') {
        throw err;
      }
      if (attemptsLeft > 0) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (3 - attemptsLeft)));
        return fetchNetwork(attemptsLeft - 1);
      }
      // If network fails but we have stale cache, gracefully serve stale cache
      if (cached) {
        return cached.data;
      }
      throw normalizeApiError(err);
    }
  };

  // If stale cache exists, revalidate in background and return stale immediately
  if (cached && now - cached.timestamp < cached.staleWhileRevalidateMs) {
    fetchNetwork(retries).catch(() => {});
    return cached.data;
  }

  // Otherwise, wait for network
  return fetchNetwork(retries);
}

async function fetchPublicList<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const { data } = await axios.get<{ success: true; data: T[] }>(url, { signal, timeout: 12000 });
  if (data?.success !== true || !Array.isArray(data.data)) throw new Error('Invalid list response');
  return data.data;
}

// === CENTRAL PUBLIC STOREFRONT API ===
export const storefrontApi = {
  async getStorefrontSettings(): Promise<StorefrontSettings> {
    const response = await axios.get('/api/coupons/promotions', { timeout: 12000 });
    return storefrontSettingsSchema.parse(response.data.data);
  },
  /**
   * Fetches the unified homepage payload in a single round-trip without waterfall.
   */
  async getHomepage(signal?: AbortSignal): Promise<HomepagePayload> {
    return fetchWithSwr<HomepagePayload>('/api/homepage', {
      signal,
      maxAgeMs: 60_000, // 1 minute
      staleMs: 300_000, // 5 minutes SWR
    });
  },

  /**
   * Catalog query with filters, pagination, and sorting.
   */
  async getProducts(
    params?: {
      category?: string;
      search?: string;
      page?: number;
      limit?: number;
      sort?: string;
      minPrice?: number;
      maxPrice?: number;
    },
    signal?: AbortSignal,
  ): Promise<{ products: Product[]; total: number; totalPages: number }> {
    const res = await axios.get<{
      data: Product[];
      meta: { total: number; totalPages: number };
    }>('/api/products', { params, signal, timeout: 12000 });
    return {
      products: res.data.data || [],
      total: res.data.meta?.total || 0,
      totalPages: res.data.meta?.totalPages || 1,
    };
  },

  /**
   * Retrieves single product by slug or serialNumber with SWR cache.
   */
  async getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product> {
    return fetchWithSwr<Product>(`/api/products/${encodeURIComponent(slug)}`, {
      signal,
      maxAgeMs: 60_000,
    });
  },

  /**
   * Prefetches a product ahead of time on card hover/focus.
   */
  prefetchProduct(slug: string): void {
    if (!slug) return;
    this.getProductBySlug(slug).catch(() => {});
  },

  /**
   * Related products for a given product slug.
   */
  async getRelatedProducts(slug: string, signal?: AbortSignal): Promise<Product[]> {
    return fetchWithSwr<Product[]>(`/api/products/${encodeURIComponent(slug)}/related`, {
      signal,
      maxAgeMs: 120_000,
    });
  },

  /**
   * Search suggestions / full search with AbortController cancellation.
   */
  async search(query: string, signal?: AbortSignal): Promise<Product[]> {
    if (!query || query.trim().length < 2) return [];
    const res = await axios.get<{ data: Product[] }>('/api/search', {
      params: { q: query.trim(), limit: 12 },
      signal,
      timeout: 10000,
    });
    return res.data.data || [];
  },

  /**
   * Curated circular rentals rail.
   */
  async getRentals(signal?: AbortSignal): Promise<unknown[]> {
    return fetchPublicList('/api/rentals', signal);
  },

  /**
   * Community pop-ups and swap meets events.
   */
  async getEvents(signal?: AbortSignal): Promise<import('@/types/storefront').EventItem[]> {
    const events = await fetchPublicList<Record<string, unknown>>('/api/events', signal);
    return events.map(mapEventForStorefront);
  },

  async getEvent(id: string): Promise<import('@/types/storefront').EventItem> {
    const event = await fetchWithSwr<Record<string, unknown>>(`/api/events/${encodeURIComponent(id)}`, { maxAgeMs: 120_000 });
    return mapEventForStorefront(event);
  },

  async registerForEvent(id: string, body: { name: string; email: string; phone: string; notes?: string }): Promise<import('@/types/storefront').EventRegistration> {
    const response = await axios.post<{ data: import('@/types/storefront').EventRegistration }>(`/api/events/${encodeURIComponent(id)}/registrations`, body);
    return response.data.data;
  },

  /**
   * Real-time coupon discount validation (THRIFT10, CIRCLE20, etc.).
   */
  async validateCoupon(code: string, subtotalInPaise: number, signal?: AbortSignal): Promise<CouponValidateResult> {
    const res = await axios.post<{ data: CouponValidateResult }>('/api/coupons/validate', {
      code,
      subtotalInPaise,
    }, { signal });
    return couponValidateResultSchema.parse(res.data.data);
  },

  /**
   * Orders placement with stock decrement.
   */
  async createOrder(orderPayload: Record<string, unknown>): Promise<Order> {
    const res = await axios.post<{ data: Order }>('/api/orders', orderPayload);
    return res.data.data;
  },

  /**
   * Reviews endpoints backed by Supabase with moderation (Resolves P1-8 & P1-9).
   */
  async getReviews(signal?: AbortSignal): Promise<import('@/types/storefront').ReviewItem[]> {
    return fetchPublicList('/api/reviews', signal);
  },

  async submitReview(body: {
    displayName: string;
    rating: number;
    title: string;
    comment: string;
    productSlug?: string;
    productName?: string;
  }): Promise<import('@/types/storefront').ReviewItem> {
    const res = await axios.post<{ data: import('@/types/storefront').ReviewItem }>('/api/reviews', body);
    return res.data.data;
  },

  /**
   * Community looks / ThriftCrew posts backed by Supabase with moderation (Resolves P1-8).
   */
  async getCommunityPosts(signal?: AbortSignal): Promise<import('@/types/storefront').CommunitySubmission[]> {
    return fetchWithSwr<import('@/types/storefront').CommunitySubmission[]>('/api/community', {
      signal,
      maxAgeMs: 60_000,
    });
  },

  async submitCommunityPost(body: {
    displayName: string;
    handle: string;
    caption: string;
    image: string;
    taggedPiece?: string;
  }): Promise<import('@/types/storefront').CommunitySubmission> {
    const res = await axios.post<{ data: import('@/types/storefront').CommunitySubmission }>('/api/community', body);
    return res.data.data;
  },

  /**
   * Rental Booking Request submission backed by Supabase with moderation (Resolves P1-8).
   */
  async submitRentalRequest(body: Record<string, unknown>): Promise<import('@/types/storefront').SimulatedRentalRequest> {
    const res = await axios.post<{ data: import('@/types/storefront').SimulatedRentalRequest }>('/api/rentals/requests', body);
    return res.data.data;
  },
};

function mapEventForStorefront(row: Record<string, unknown>): import('@/types/storefront').EventItem {
  const label = String(row.date || '');
  const pieces = label.split(/[·•]/);
  const date = pieces[0]?.trim() || label;
  const time = pieces[1]?.trim() || '';
  const capacity = typeof row.capacity === 'number' ? row.capacity : undefined;
  const registered = typeof row.registeredCount === 'number' ? row.registeredCount : 0;
  return {
    id: String(row.id), title: String(row.title), description: String(row.description || ''),
    fullDetails: String(row.description || ''), date, time, location: String(row.location),
    image: String(row.image || ''), spotsLabel: capacity ? `${Math.max(capacity - registered, 0)} Spots` : 'Open Entry', highlights: [],
  };
}
