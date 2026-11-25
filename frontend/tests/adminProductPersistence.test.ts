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
});
