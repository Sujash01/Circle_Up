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
    const cleanEmail = credentials.email.trim().toLowerCase();
    try {
      const res = await adminClient.post<{ data: { user: AdminUser; csrfToken: string } }>('/auth/login', credentials);
      if (res.data.data.csrfToken) {
        setAdminCsrfToken(res.data.data.csrfToken);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('circleup_admin_demo_user', JSON.stringify(res.data.data.user));
      }
      return res.data.data;
    } catch (err) {
      // Seamless resilience for one-click demo credentials if the backend server is temporarily unreachable or offline
      const isDemoOwner = cleanEmail === 'owner@circleuponline.com' && credentials.password === 'OwnerPassword123';
      const isDemoStaff = cleanEmail === 'staff@circleuponline.com' && credentials.password === 'StaffPassword123';

      if (isDemoOwner || isDemoStaff) {
        const demoUser: AdminUser = {
          id: isDemoOwner ? 'owner-demo-01' : 'staff-demo-01',
          email: cleanEmail,
          name: isDemoOwner ? 'CircleUp Owner' : 'CircleUp Staff',
          role: isDemoOwner ? 'owner' : 'staff',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const demoCsrf = 'demo-csrf-session-' + Date.now();
        setAdminCsrfToken(demoCsrf);
        if (typeof window !== 'undefined') {
          localStorage.setItem('circleup_admin_demo_user', JSON.stringify(demoUser));
        }
        return { user: demoUser, csrfToken: demoCsrf };
      }

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
      if (typeof window !== 'undefined') {
        localStorage.setItem('circleup_admin_demo_user', JSON.stringify(res.data.data.user));
      }
      return res.data.data;
    } catch (err) {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('circleup_admin_demo_user');
        if (cached) {
          try {
            const user = JSON.parse(cached) as AdminUser;
            return { user, csrfToken: currentCsrfToken || 'demo-csrf-session' };
          } catch {
            localStorage.removeItem('circleup_admin_demo_user');
          }
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
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('site_settings').select('*').eq('id', 'default').single();
        if (!error && data) {
          return {
            announcementText: data.announcement_text || '',
            announcementLink: data.announcement_link || '',
            isAnnouncementActive: Boolean(data.is_announcement_active),
            marqueePhrases: Array.isArray(data.marquee_phrases) ? data.marquee_phrases : [],
            storeAddress: data.store_address || '',
            contactEmail: data.contact_email || '',
            contactPhone: data.contact_phone || '',
            whatsappNumber: data.whatsapp_number || '',
            categoryTiles: data.category_tiles || [],
            curatedDrop: data.curated_drop || { enabled: false },
          } as unknown as SiteSettings;
        }
      } catch {
        // Fall back to REST API
      }
    }
    try {
      const res = await adminClient.get<{ data: SiteSettings }>('/settings');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateSettings(data: Partial<SiteSettings> & Record<string, unknown>) {
    if (isSupabaseConfigured()) {
      try {
        const row: Record<string, unknown> = {};
        if (data.announcementText !== undefined) row.announcement_text = data.announcementText;
        if (data.announcementLink !== undefined) row.announcement_link = data.announcementLink;
        if (data.isAnnouncementActive !== undefined) row.is_announcement_active = data.isAnnouncementActive;
        if (data.marqueePhrases !== undefined) row.marquee_phrases = data.marqueePhrases;
        if (data.storeAddress !== undefined) row.store_address = data.storeAddress;
        if (data.contactEmail !== undefined) row.contact_email = data.contactEmail;
        if (data.contactPhone !== undefined) row.contact_phone = data.contactPhone;
        if (data.whatsappNumber !== undefined) row.whatsapp_number = data.whatsappNumber;
        if (data.categoryTiles !== undefined) row.category_tiles = data.categoryTiles;
        if (data.customDrop !== undefined) row.curated_drop = data.customDrop;
        if (data.curatedDrop !== undefined) row.curated_drop = data.curatedDrop;

        const { data: updated, error } = await supabase
          .from('site_settings')
          .update(row)
          .eq('id', 'default')
          .select()
          .single();

        if (!error && updated) {
          return {
            announcementText: updated.announcement_text,
            announcementLink: updated.announcement_link,
            isAnnouncementActive: updated.is_announcement_active,
            marqueePhrases: updated.marquee_phrases,
            storeAddress: updated.store_address,
            contactEmail: updated.contact_email,
            contactPhone: updated.contact_phone,
            whatsappNumber: updated.whatsapp_number,
            categoryTiles: updated.category_tiles,
            customDrop: updated.curated_drop,
          } as unknown as SiteSettings;
        }
      } catch {
        // Fall back to REST API
      }
    }
    try {
      const res = await adminClient.put<{ data: SiteSettings }>('/settings', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  // === COUPONS ===
  async getCoupons() {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          return data.map((c: Record<string, unknown>) => ({
            id: c.id as string,
            code: c.code as string,
            description: (c.description as string) || '',
            type: (c.discount_type as string) || 'PERCENTAGE',
            value: Number(c.discount_value || 0),
            maxDiscount: c.max_discount_paise ? Number(c.max_discount_paise) : undefined,
            minCartSubtotal: Number(c.min_order_paise || 0),
            usageLimit: c.usage_limit ? Number(c.usage_limit) : undefined,
            usageCount: Number(c.usage_count || 0),
            isActive: Boolean(c.is_active),
            showInHeader: Boolean(c.show_in_header),
            headerBannerText: (c.header_banner_text as string) || undefined,
            showInExitIntent: Boolean(c.show_in_exit_intent),
            popupHeadline: (c.popup_headline as string) || undefined,
            popupSubtext: (c.popup_subtext as string) || undefined,
            popupBadgeText: (c.popup_badge_text as string) || undefined,
            startsAt: (c.starts_at as string) || undefined,
            expiresAt: (c.ends_at as string) || undefined,
          })) as unknown as Coupon[];
        }
      } catch {
        // Fall back
      }
    }
    try {
      const res = await adminClient.get<{ data: Coupon[] }>('/coupons');
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async createCoupon(data: Partial<Coupon> & Record<string, unknown>) {
    if (isSupabaseConfigured()) {
      try {
        const discountType = String(data.discountType || data.type || 'PERCENTAGE').toUpperCase();
        const row = {
          code: (data.code || '').trim().toUpperCase(),
          description: data.description || '',
          discount_type: discountType,
          discount_value: Number(data.value || 0),
          max_discount_paise: data.maxDiscount ? Number(data.maxDiscount) : null,
          min_order_paise: Number(data.minCartSubtotal || data.minOrderAmount || 0),
          usage_limit: data.usageLimit ? Number(data.usageLimit) : null,
          is_active: data.isActive !== false,
          show_in_header: Boolean(data.showInHeader),
          header_banner_text: (data.headerBannerText as string) || null,
          show_in_exit_intent: Boolean(data.showInExitIntent),
          popup_headline: (data.popupHeadline as string) || null,
          popup_subtext: (data.popupSubtext as string) || null,
          popup_badge_text: (data.popupBadgeText as string) || null,
          starts_at: (data.startsAt as string) || null,
          ends_at: (data.expiresAt as string) || null,
        };
        const { data: inserted, error } = await supabase.from('coupons').insert([row]).select().single();
        if (!error && inserted) {
          return {
            id: inserted.id,
            code: inserted.code,
            description: inserted.description,
            discountType: inserted.discount_type,
            type: inserted.discount_type,
            value: inserted.discount_value,
            maxDiscount: inserted.max_discount_paise,
            minCartSubtotal: inserted.min_order_paise,
            minOrderAmount: inserted.min_order_paise,
            usageLimit: inserted.usage_limit,
            usageCount: inserted.usage_count,
            isActive: inserted.is_active,
            showInHeader: inserted.show_in_header,
            headerBannerText: inserted.header_banner_text,
            showInExitIntent: inserted.show_in_exit_intent,
            popupHeadline: inserted.popup_headline,
            popupSubtext: inserted.popup_subtext,
            popupBadgeText: inserted.popup_badge_text,
            startsAt: inserted.starts_at,
            expiresAt: inserted.ends_at,
          } as unknown as Coupon;
        }
      } catch {
        // Fall back
      }
    }
    try {
      const res = await adminClient.post<{ data: Coupon }>('/coupons', data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async updateCoupon(id: string, data: Partial<Coupon> & Record<string, unknown>) {
    if (isSupabaseConfigured()) {
      try {
        const row: Record<string, unknown> = {};
        if (data.code !== undefined) row.code = String(data.code).trim().toUpperCase();
        if (data.description !== undefined) row.description = data.description;
        if (data.discountType !== undefined || data.type !== undefined) {
          row.discount_type = String(data.discountType || data.type).toUpperCase();
        }
        if (data.value !== undefined) row.discount_value = Number(data.value);
        if (data.maxDiscount !== undefined) row.max_discount_paise = data.maxDiscount;
        if (data.minCartSubtotal !== undefined) row.min_order_paise = Number(data.minCartSubtotal);
        if (data.minOrderAmount !== undefined) row.min_order_paise = Number(data.minOrderAmount);
        if (data.usageLimit !== undefined) row.usage_limit = data.usageLimit;
        if (data.isActive !== undefined) row.is_active = data.isActive;
        if (data.showInHeader !== undefined) row.show_in_header = Boolean(data.showInHeader);
        if (data.headerBannerText !== undefined) row.header_banner_text = data.headerBannerText;
        if (data.showInExitIntent !== undefined) row.show_in_exit_intent = Boolean(data.showInExitIntent);
        if (data.popupHeadline !== undefined) row.popup_headline = data.popupHeadline;
        if (data.popupSubtext !== undefined) row.popup_subtext = data.popupSubtext;
        if (data.popupBadgeText !== undefined) row.popup_badge_text = data.popupBadgeText;
        if (data.startsAt !== undefined) row.starts_at = data.startsAt;
        if (data.expiresAt !== undefined) row.ends_at = data.expiresAt;

        const { data: updated, error } = await supabase.from('coupons').update(row).eq('id', id).select().single();
        if (!error && updated) {
          return {
            id: updated.id,
            code: updated.code,
            description: updated.description,
            discountType: updated.discount_type,
            type: updated.discount_type,
            value: updated.discount_value,
            maxDiscount: updated.max_discount_paise,
            minCartSubtotal: updated.min_order_paise,
            minOrderAmount: updated.min_order_paise,
            usageLimit: updated.usage_limit,
            usageCount: updated.usage_count,
            isActive: updated.is_active,
            showInHeader: updated.show_in_header,
            headerBannerText: updated.header_banner_text,
            showInExitIntent: updated.show_in_exit_intent,
            popupHeadline: updated.popup_headline,
            popupSubtext: updated.popup_subtext,
            popupBadgeText: updated.popup_badge_text,
            startsAt: updated.starts_at,
            expiresAt: updated.ends_at,
          } as unknown as Coupon;
        }
      } catch {
        // Fall back
      }
    }
    try {
      const res = await adminClient.put<{ data: Coupon }>(`/coupons/${id}`, data);
      return res.data.data;
    } catch (err) {
      throw normalizeApiError(err);
    }
  },

  async deleteCoupon(id: string) {
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('coupons').delete().eq('id', id);
        if (!error) return { success: true };
      } catch {
        // Fall back
      }
    }
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
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('activity_audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (!error && Array.isArray(data)) {
          return data.map((log: Record<string, unknown>) => ({
            id: log.id as string,
            actorEmail: (log.actor_email as string) || (log.actor_id as string) || 'system',
            actorRole: (log.actor_role as string) || 'admin',
            action: (log.action as string) || 'UPDATE',
            entity: (log.table_name as string) || 'Unknown',
            entityId: (log.record_id as string) || '',
            diff: (log.after_state as Record<string, unknown>) || (log.before_state as Record<string, unknown>) || {},
            ipAddress: (log.ip_address as string) || undefined,
            createdAt: (log.created_at as string) || new Date().toISOString(),
          }));
        }
      } catch {
        // Fall back
      }
    }
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
