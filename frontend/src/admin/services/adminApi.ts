import axios, { type AxiosInstance } from 'axios';
import { normalizeApiError } from '@/services/apiClient';
import { productService } from '@/services/productService';
import { clearStorefrontCache } from '@/services/storefrontApi';
import type {
  AdminUser,
  Coupon,
  Customer,
  Order,
  Product,
  ProductListQuery,
  SiteSettings,
} from '@circleup/shared';

const CSRF_TOKEN_KEY = 'circleup_admin_csrf_token';
const SETTINGS_OVERRIDES_KEY = 'circleup_site_settings_override';

let currentCsrfToken = typeof window !== 'undefined' ? (localStorage.getItem(CSRF_TOKEN_KEY) || '') : '';

export function setAdminCsrfToken(token: string) {
  currentCsrfToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem(CSRF_TOKEN_KEY, token);
    else localStorage.removeItem(CSRF_TOKEN_KEY);
  }
}

export function getAdminCsrfToken(): string {
  if (!currentCsrfToken && typeof window !== 'undefined') {
    currentCsrfToken = localStorage.getItem(CSRF_TOKEN_KEY) || '';
  }
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
  const csrf = getAdminCsrfToken();
  if (csrf && config.headers && !['get', 'head', 'options'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrf;
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

export interface OverviewMetricsData {
  liveProductsCount: number;
  lowStockCount: number;
  activeOrdersCount: number;
  totalRevenuePaise: number;
  totalOrdersCount: number;
}

export interface OverviewResponse {
  metrics: OverviewMetricsData;
  recentOrders: Order[];
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
      throw normalizeApiError(new Error('Unable to revoke the admin session.'));
    } finally {
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

  async getAdminUsers() {
    try {
      const res = await adminClient.get<{ data: AdminUser[] }>('/users');
      return res.data.data;
    } catch (err) { throw normalizeApiError(err); }
  },

  async getAdminUserById(id: string) {
    try {
      const res = await adminClient.get<{ data: AdminUser }>(`/users/${id}`);
      return res.data.data;
    } catch (err) { throw normalizeApiError(err); }
  },

  async createAdminUser(input: { email: string; name: string; password: string; role: 'owner' | 'staff' }) {
    try {
      const res = await adminClient.post<{ data: AdminUser }>('/users', input);
      return res.data.data;
    } catch (err) { throw normalizeApiError(err); }
  },

  async updateAdminUser(id: string, input: { email?: string; name?: string; role?: 'owner' | 'staff'; isActive?: boolean; password?: string }) {
    try {
      const res = await adminClient.patch<{ data: AdminUser }>(`/users/${id}`, input);
      return res.data.data;
    } catch (err) { throw normalizeApiError(err); }
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
      void productService.initLiveSync();
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateProduct(id: string, data: Partial<AdminProductFormValues>) {
    try {
      const res = await adminClient.put<{ data: Product }>(`/products/${id}`, data);
      clearStorefrontCache();
      void productService.initLiveSync();
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async duplicateProduct(id: string) {
    try {
      const res = await adminClient.post<{ data: Product }>(`/products/${id}/duplicate`);
      void productService.initLiveSync();
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async bulkAction(action: 'publish' | 'unpublish' | 'archive' | 'changeCategory' | 'delete', ids: string[], payload?: { category?: string }) {
    try {
      const res = await adminClient.post('/products/bulk', { action, ids, payload });
      clearStorefrontCache();
      void productService.initLiveSync();
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async softDeleteProduct(id: string) {
    try {
      const res = await adminClient.delete(`/products/${id}`);
      clearStorefrontCache();
      void productService.initLiveSync();
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async restoreProduct(id: string) {
    try {
      const res = await adminClient.post(`/products/${id}/restore`);
      clearStorefrontCache();
      void productService.initLiveSync();
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async permanentDeleteProduct(id: string) {
    try {
      const res = await adminClient.delete(`/products/${id}/permanent`);
      clearStorefrontCache();
      void productService.initLiveSync();
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

  async markOrderPaymentReceived(id: string, options?: { utrNumber?: string; paymentProofUrl?: string }) {
    try {
      const res = await adminClient.put<{ data: Order }>(`/orders/${id}/payment-status`, {
        paymentStatus: 'PAID',
        utrNumber: options?.utrNumber,
        paymentProofUrl: options?.paymentProofUrl,
      });
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async processOrderRefund(id: string, payload: { amountPaise: number; reason: string; routingAction?: string }) {
    try {
      const res = await adminClient.post<{ data: { order: Order; refund: unknown } }>(`/orders/${id}/refunds`, payload);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async createOrderFulfillment(id: string, payload: { trackingNumber: string; carrier: string; notes?: string }) {
    try {
      const res = await adminClient.post<{ data: { order: Order; fulfillment: unknown } }>(`/orders/${id}/fulfillments`, payload);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async getDailyReconciliation(days = 30) {
    try {
      const res = await adminClient.get<{ data: unknown[] }>('/orders/reconciliation', { params: { days } });
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === INQUIRIES (CONTACT INBOX) ===
  async getInquiries(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    try {
      const res = await adminClient.get<{ data: unknown[]; meta: unknown }>('/inquiries', { params });
      return res.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async getInquiry(id: string) {
    try {
      const res = await adminClient.get<{ data: unknown }>(`/inquiries/${id}`);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateInquiry(id: string, patch: { status?: string; notes?: string; reply?: string }) {
    try {
      const res = await adminClient.patch<{ data: unknown }>(`/inquiries/${id}`, patch);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === DASHBOARD OVERVIEW (METRICS & RECENT ORDERS) ===
  async getOverview(): Promise<OverviewResponse> {
    try {
      const res = await adminClient.get<{ data: OverviewResponse }>('/overview');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === MEDIA UPLOAD ===
  async uploadMedia(files: File[], collection: 'products' | 'events' | 'rentals' | 'general' = 'products'): Promise<MediaUploadResult[]> {
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('images', file);
      }
      formData.append('collection', collection);
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

  async deleteMedia(url: string): Promise<{ deleted: boolean }> {
    try {
      const res = await adminClient.delete<{ data: { deleted: boolean } }>('/media', { data: { url } });
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === SETTINGS ===
  async getSettings() {
    try {
      const res = await adminClient.get<{ data: SiteSettings }>('/settings');
      if (typeof window !== 'undefined') localStorage.removeItem(SETTINGS_OVERRIDES_KEY);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateSettings(data: Partial<SiteSettings> & Record<string, unknown>) {
    try {
      const res = await adminClient.put<{ data: SiteSettings }>('/settings', data);
      clearStorefrontCache();
      if (typeof window !== 'undefined') localStorage.removeItem(SETTINGS_OVERRIDES_KEY);
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

  async createCoupon(data: Partial<Coupon> & Record<string, unknown>) {
    try {
      const res = await adminClient.post<{ data: Coupon }>('/coupons', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateCoupon(id: string, data: Partial<Coupon> & Record<string, unknown>) {
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
      if (!Array.isArray(res.data.data)) throw new Error('Customer API returned an invalid response.');
      return {
        customers: res.data.data,
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
          savedAddresses: Array<{ addressLine?: string; city?: string; state?: string; postalCode?: string; country?: string; landmark?: string }>;
          marketingPreferences: { email: boolean; whatsapp: boolean };
        };
      }>(`/customers/${id}`);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateCustomer(id: string, patch: {
    name?: string;
    phone?: string;
    notes?: string;
    tier?: 'VIP' | 'REGULAR' | 'NEW' | 'COMMUNITY';
    savedAddresses?: Array<{ addressLine?: string; city?: string; state?: string; postalCode?: string; country?: string; landmark?: string }>;
    marketingOptInEmail?: boolean;
    marketingOptInWhatsapp?: boolean;
  }) {
    try {
      const res = await adminClient.patch(`/customers/${id}`, patch);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },
};
