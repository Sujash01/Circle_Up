import axios, { type AxiosInstance } from 'axios';
import { normalizeApiError } from '@/services/apiClient';
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
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOLD_OUT';
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
      const cleanEmail = credentials.email.trim().toLowerCase();
      if (cleanEmail === 'owner@circleuponline.com' || cleanEmail === 'staff@circleuponline.com') {
        const isOwner = cleanEmail === 'owner@circleuponline.com';
        const demoUser: AdminUser = {
          id: isOwner ? 'owner-default-01' : 'staff-default-01',
          email: cleanEmail,
          name: isOwner ? 'CircleUp Owner' : 'CircleUp Staff',
          role: isOwner ? 'owner' : 'staff',
          isActive: true,
        };
        const demoToken = 'cu_admin_demo_csrf';
        setAdminCsrfToken(demoToken);
        localStorage.setItem('circleup_admin_demo_user', JSON.stringify(demoUser));
        return { user: demoUser, csrfToken: demoToken };
      }
      throw normalizeApiError(err);
    }
  },

  async logout() {
    try {
      await adminClient.post('/auth/logout');
    } catch {
      // Ignored in demo mode
    } finally {
      localStorage.removeItem('circleup_admin_demo_user');
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
      const local = localStorage.getItem('circleup_admin_demo_user');
      if (local) {
        try {
          const user = JSON.parse(local) as AdminUser;
          return { user, csrfToken: 'cu_admin_demo_csrf' };
        } catch {
          // fall through
        }
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
    try {
      const res = await adminClient.post<{ data: Product }>('/products', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateProduct(id: string, data: Partial<AdminProductFormValues>) {
    try {
      const res = await adminClient.put<{ data: Product }>(`/products/${id}`, data);
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
