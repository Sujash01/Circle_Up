import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi, adminClient } from '../src/admin/services/adminApi';

describe('admin product persistence contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('does not report a successful create when the backend fails', async () => {
    vi.spyOn(adminClient, 'post').mockRejectedValue(new Error('database unavailable'));
    await expect(adminApi.createProduct({ name: 'New product', price: 100 } as never)).rejects.toThrow();
  });

  it('does not return a fabricated update or persist product overrides locally', async () => {
    vi.spyOn(adminClient, 'put').mockRejectedValue(new Error('database unavailable'));
    await expect(adminApi.updateProduct('CU-001', { name: 'Changed' })).rejects.toThrow();
    expect(window.localStorage.getItem('circleup_product_overrides')).toBeNull();
  });

  it('does not synthesize admin orders or status updates when the API fails', async () => {
    window.localStorage.setItem('circleup_admin_demo_user', 'true');
    vi.spyOn(adminClient, 'get').mockRejectedValue(new Error('orders unavailable'));
    vi.spyOn(adminClient, 'put').mockRejectedValue(new Error('orders unavailable'));
    await expect(adminApi.getOrders()).rejects.toThrow();
    await expect(adminApi.updateOrderStatus('ORD-261122-12345678', 'CANCELLED')).rejects.toThrow();
    await expect(adminApi.markOrderPaymentReceived('ORD-261122-12345678', {
      utrNumber: 'receipt-123', confirmedAmountPaise: 10000,
    })).rejects.toThrow();
  });

  it('adminApi.getProduct fetches product by serialNumber, slug, or ID', async () => {
    const mockProduct = { id: 'uuid-1', serialNumber: 'CU-042', name: 'Vintage Shirt', price: 250000 };
    const getSpy = vi.spyOn(adminClient, 'get').mockResolvedValue({ data: { success: true, data: mockProduct } });

    const result = await adminApi.getProduct('CU-042');
    expect(result).toEqual(mockProduct);
    expect(getSpy).toHaveBeenCalledWith('/products/CU-042');

    getSpy.mockRejectedValueOnce(new Error('Product not found'));
    await expect(adminApi.getProduct('unknown')).rejects.toThrow();
  });

  it('adminApi.uploadMedia transmits FormData without overriding multipart boundary', async () => {
    const file = new File(['dummy content'], 'swatch.png', { type: 'image/png' });
    const mockUploadResult = {
      original: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/uuid/800w.webp',
      w400: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/uuid/400w.webp',
      w800: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/uuid/800w.webp',
      w1600: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/uuid/1600w.webp',
      hash: '0123456789abcdef',
    };

    let capturedHeaders: Record<string, unknown> | undefined;
    const postSpy = vi.spyOn(adminClient, 'post').mockImplementation(async (url, data, config) => {
      capturedHeaders = config?.headers;
      return { data: { success: true, data: mockUploadResult } };
    });

    const results = await adminApi.uploadMedia([file], 'products');
    expect(results).toHaveLength(1);
    expect(results[0]?.w800).toContain('/800w.webp');
    expect(postSpy).toHaveBeenCalledWith('/media/upload', expect.any(FormData));
    // Header must NOT be fixed string 'multipart/form-data' without boundary
    expect(capturedHeaders?.['Content-Type']).toBeUndefined();
  });
});
