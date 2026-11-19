import axios, { type AxiosInstance } from 'axios';
import { normalizeApiError } from '@/services/apiClient';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { normalizeCategorySlug } from '@/services/productService';
import { productService } from '@/services/productService';
import type {
  AdminUser,
  Coupon,
  Customer,
  Order,
  Product,
  ProductListQuery,
  SiteSettings,
} from '@circleup/shared';

let currentCsrfToken = '';

export function setAdminCsrfToken(token: string) {
  currentCsrfToken = token;
}

export function getAdminCsrfToken(): string {
  return currentCsrfToken;
}

export const adminClient: AxiosInstance = axios.create({
  baseURL: '/api/admin',
  timeout: 20000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'CircleUpAdmin',
  },
});

adminClient.interceptors.request.use((config) => {
  if (currentCsrfToken && config.headers && !['get', 'head', 'options'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = currentCsrfToken;
  }
  return config;
});

export interface AdminProductFormValues {
  name: string;
  slug?: string;
  serialNumber?: string;
  categoryCode?: string;
  sizeCategory?: string;
  measurementsData?: Record<string, string>;
  measurements?: string;
  description: string;
  price: number;
  originalPrice?: number;
  compareAtPrice?: number;
  stock: number;
  category: string;
  categoryLabel?: string;
  subcategory?: string;
  productType?: string;
  condition?: string;
  gender?: string;
  badge?: string;
  sku?: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
  featured?: boolean;
  chestPick?: boolean;
  isNewArrival?: boolean;
  status:
    | 'AVAILABLE'
    | 'SOLD'
    | 'BOOKED'
    | 'MISSING'
    | 'NEED_ATTENTION'
    | 'EXCHANGE_BARTER'
    | 'RENT'
    | 'DRAFT'
    | 'PUBLISHED'
    | 'ARCHIVED'
    | 'SOLD_OUT'
    | string;
  images: string[];
  sizes: string[];
  variants?: Array<{ id: string; label: string; size: string; stock: number }>;
}

export interface MediaUploadResult {
  original: string;
  w400: string;
  w800: string;
  w1600: string;
  hash: string;
}

export const adminApi = {
  // === AUTH ===
  async login(credentials: { email: string; password: string }) {
    try {
      const res = await adminClient.post<{ data: { user: AdminUser; csrfToken: string } }>('/auth/login', credentials);
      if (res.data.data.csrfToken) {
        setAdminCsrfToken(res.data.data.csrfToken);
      }
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async logout() {
    try {
      await adminClient.post('/auth/logout');
    } catch {
      // Ignored if session already ended
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('circleup_admin_demo_user');
      }
      setAdminCsrfToken('');
    }
    return { success: true };
  },

  async getMe() {
    try {
      const res = await adminClient.get<{ data: { user: AdminUser; csrfToken: string } }>('/auth/me');
      if (res.data.data.csrfToken) {
        setAdminCsrfToken(res.data.data.csrfToken);
      }
      return res.data.data;
    } catch (err) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('circleup_admin_demo_user');
      }
      throw normalizeApiError(err);
    }
  },

  async changePassword(passwords: { currentPassword: string; newPassword: string }) {
    try {
      const res = await adminClient.post('/auth/change-password', passwords);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === PRODUCTS ===
  async getProducts(params?: ProductListQuery & { includeArchived?: boolean; includeDeleted?: boolean }) {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('products').select('*').order('created_at', { ascending: false });
        if (!params?.includeArchived) {
          query = query.neq('status', 'ARCHIVED');
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const mapped = data.map((row: Record<string, unknown>) => ({
            id: (row.id as string) || (row.serial_number as string),
            serialNumber: (row.serial_number as string) || (row.id as string),
            categoryCode: (row.category_code as string) || undefined,
            sizeCategory: (row.size_category as string) || undefined,
            measurementsData: (row.measurements_data as Record<string, string>) || undefined,
            measurements: (row.measurements as string) || undefined,
            name: (row.name as string) || 'Untitled Piece',
            slug: (row.slug as string) || 'untitled-piece',
            description: (row.description as string) || '',
            price: Number(row.price || 0),
            originalPrice: row.original_price ? Number(row.original_price) : undefined,
            compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
            stock: Number(row.stock ?? 1),
            images: Array.isArray(row.images) ? (row.images as string[]) : [],
            sizes: Array.isArray(row.sizes) ? (row.sizes as string[]) : [],
            category: normalizeCategorySlug(row.category as string, (row.serial_number as string) || (row.id as string)),
            categoryLabel: (row.category_label as string) || (row.category as string) || undefined,
            subcategory: (row.subcategory as string) || '',
            condition: (row.condition as Product['condition']) || 'Mint',
            gender: (row.gender as Product['gender']) || 'Women',
            status: (row.status as Product['status']) || 'AVAILABLE',
            tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
            featured: Boolean(row.featured),
            isNewArrival: Boolean(row.is_new_arrival),
            createdAt: (row.created_at as string) || new Date().toISOString(),
          })) as unknown as Product[];

          return {
            data: mapped,
            meta: { total: mapped.length, page: 1, limit: 100, totalPages: 1, hasNext: false },
          };
        }
      } catch {
        // Fall back to REST API
      }
    }

    try {
      const res = await adminClient.get<{
        data: Product[];
        meta: { total: number; page: number; limit: number; totalPages: number; hasNext: boolean };
      }>('/products', { params });
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async createProduct(data: AdminProductFormValues) {
    if (isSupabaseConfigured()) {
      try {
        const serial = data.serialNumber?.trim().toUpperCase() || `CU-${Date.now().toString(36).toUpperCase()}`;
        const slug =
          data.slug?.trim().toLowerCase() ||
          `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${serial.toLowerCase()}`;

        const row = {
          name: data.name.trim(),
          slug,
          serial_number: serial,
          category_code: data.categoryCode || null,
          size_category: data.sizeCategory || null,
          measurements_data: data.measurementsData || {},
          measurements: data.measurements || null,
          description: data.description,
          price: data.price,
          original_price: data.originalPrice || null,
          compare_at_price: data.compareAtPrice || null,
          stock: data.stock,
          category: data.category,
          category_label: data.categoryLabel || null,
          subcategory: data.subcategory || null,
          product_type: data.productType || 'Pre-Loved',
          condition: data.condition || 'Mint',
          gender: data.gender || 'Women',
          badge: data.badge || null,
          tags: data.tags || [],
          featured: Boolean(data.featured),
          is_new_arrival: Boolean(data.isNewArrival ?? true),
          status: data.status || 'AVAILABLE',
          images: data.images,
          sizes: data.sizes,
          variants: data.variants || [],
        };

        const { data: inserted, error } = await supabase
          .from('products')
          .insert([row])
          .select()
          .single();

        if (!error && inserted) {
          void productService.initLiveSync();
          return inserted as unknown as Product;
        }
      } catch {
        // Fall back to REST API
      }
    }

    try {
      const res = await adminClient.post<{ data: Product }>('/products', data);
      void productService.initLiveSync();
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateProduct(id: string, data: Partial<AdminProductFormValues>) {
    if (isSupabaseConfigured()) {
      try {
        const updates: Record<string, unknown> = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.slug !== undefined) updates.slug = data.slug;
        if (data.serialNumber !== undefined) updates.serial_number = data.serialNumber;
        if (data.categoryCode !== undefined) updates.category_code = data.categoryCode;
        if (data.sizeCategory !== undefined) updates.size_category = data.sizeCategory;
        if (data.measurementsData !== undefined) updates.measurements_data = data.measurementsData;
        if (data.measurements !== undefined) updates.measurements = data.measurements;
        if (data.description !== undefined) updates.description = data.description;
        if (data.price !== undefined) updates.price = data.price;
        if (data.originalPrice !== undefined) updates.original_price = data.originalPrice;
        if (data.stock !== undefined) updates.stock = data.stock;
        if (data.category !== undefined) updates.category = data.category;
        if (data.subcategory !== undefined) updates.subcategory = data.subcategory;
        if (data.condition !== undefined) updates.condition = data.condition;
        if (data.gender !== undefined) updates.gender = data.gender;
        if (data.status !== undefined) updates.status = data.status;
        if (data.images !== undefined) updates.images = data.images;
        if (data.sizes !== undefined) updates.sizes = data.sizes;

        const { data: updated, error } = await supabase
          .from('products')
          .update(updates)
          .or(`id.eq.${id},serial_number.eq.${id}`)
          .select()
          .single();

        if (!error && updated) {
          void productService.initLiveSync();
          return updated as unknown as Product;
        }
      } catch {
        // Fall back to REST API
      }
    }

    try {
      const res = await adminClient.put<{ data: Product }>(`/products/${id}`, data);
      void productService.initLiveSync();
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async duplicateProduct(id: string) {
    try {
      const res = await adminClient.post<{ data: Product }>(`/products/${id}/duplicate`);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async bulkAction(action: 'publish' | 'unpublish' | 'archive' | 'changeCategory' | 'delete', ids: string[], payload?: { category?: string }) {
    try {
      const res = await adminClient.post('/products/bulk', { action, ids, payload });
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async softDeleteProduct(id: string) {
    try {
      const res = await adminClient.delete(`/products/${id}`);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async restoreProduct(id: string) {
    try {
      const res = await adminClient.post(`/products/${id}/restore`);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async permanentDeleteProduct(id: string) {
    try {
      const res = await adminClient.delete(`/products/${id}/permanent`);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === ORDERS ===
  async getOrders(params?: { page?: number; limit?: number; status?: string; search?: string }) {
    try {
      const res = await adminClient.get<{
        data: Order[];
        meta: { total: number; page: number; limit: number; totalPages: number; hasNext: boolean };
      }>('/orders', { params });
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateOrderStatus(id: string, status: string) {
    try {
      const res = await adminClient.put<{ data: Order }>(`/orders/${id}/status`, { status });
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === MEDIA UPLOAD ===
  async uploadMedia(files: File[]): Promise<MediaUploadResult[]> {
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('images', file);
      }
      const res = await adminClient.post<{ data: MediaUploadResult | MediaUploadResult[] }>(
        '/media/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return Array.isArray(res.data.data) ? res.data.data : [res.data.data];
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === SETTINGS ===
  async getSettings() {
    try {
      const res = await adminClient.get<{ data: SiteSettings }>('/settings');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateSettings(data: Partial<SiteSettings>) {
    try {
      const res = await adminClient.put<{ data: SiteSettings }>('/settings', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === COUPONS ===
  async getCoupons() {
    try {
      const res = await adminClient.get<{ data: Coupon[] }>('/coupons');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async createCoupon(data: Partial<Coupon>) {
    try {
      const res = await adminClient.post<{ data: Coupon }>('/coupons', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateCoupon(id: string, data: Partial<Coupon>) {
    try {
      const res = await adminClient.put<{ data: Coupon }>(`/coupons/${id}`, data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async deleteCoupon(id: string) {
    try {
      const res = await adminClient.delete(`/coupons/${id}`);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === RENTALS ===
  async getRentals() {
    try {
      const res = await adminClient.get<{ data: Record<string, unknown>[] }>('/rentals');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async createRental(data: Record<string, unknown>) {
    try {
      const res = await adminClient.post<{ data: Record<string, unknown> }>('/rentals', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateRental(id: string, data: Record<string, unknown>) {
    try {
      const res = await adminClient.put<{ data: Record<string, unknown> }>(`/rentals/${id}`, data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async deleteRental(id: string) {
    try {
      const res = await adminClient.delete(`/rentals/${id}`);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === EVENTS ===
  async getEvents() {
    try {
      const res = await adminClient.get<{ data: Record<string, unknown>[] }>('/events');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async createEvent(data: Record<string, unknown>) {
    try {
      const res = await adminClient.post<{ data: Record<string, unknown> }>('/events', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateEvent(id: string, data: Record<string, unknown>) {
    try {
      const res = await adminClient.put<{ data: Record<string, unknown> }>(`/events/${id}`, data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async deleteEvent(id: string) {
    try {
      const res = await adminClient.delete(`/events/${id}`);
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === ACTIVITY ===
  async getActivity() {
    try {
      const res = await adminClient.get<{
        data: Array<{
          _id?: string;
          id?: string;
          actorEmail: string;
          actorRole: string;
          action: string;
          entity: string;
          entityId: string;
          diff?: Record<string, unknown>;
          ipAddress?: string;
          createdAt: string;
        }>;
      }>('/activity');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === CUSTOMERS (CRM) ===
  async getCustomers(params?: { page?: number; limit?: number; search?: string; tier?: string }) {
    try {
      const res = await adminClient.get<{
        data: Customer[];
        meta?: { page: number; limit: number; total: number; totalPages: number };
      }>('/customers', { params });
      return {
        customers: res.data.data || [],
        meta: res.data.meta || { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async getCustomerById(id: string) {
    try {
      const res = await adminClient.get<{
        data: {
          customer: Customer;
          orders: Order[];
          sustainabilityImpact: {
            garmentsSaved: number;
            co2AvoidedKg: number;
            waterSavedLitres: number;
          };
        };
      }>(`/customers/${id}`);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },
};
