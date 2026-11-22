import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi, adminClient } from '../src/admin/services/adminApi';

describe('admin customer API persistence contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns actual empty results from the Express API without local customer data', async () => {
    vi.spyOn(adminClient, 'get').mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } } } as never);
    await expect(adminApi.getCustomers()).resolves.toMatchObject({ customers: [], meta: { total: 0 } });
  });

  it('rejects failed or malformed reads rather than presenting an empty synthetic result', async () => {
    vi.spyOn(adminClient, 'get').mockRejectedValueOnce(new Error('database unavailable'));
    await expect(adminApi.getCustomers()).rejects.toThrow();
    vi.spyOn(adminClient, 'get').mockResolvedValueOnce({ data: { data: null } } as never);
    await expect(adminApi.getCustomers()).rejects.toThrow();
  });

  it('does not report customer updates as successful when the Express API fails', async () => {
    vi.spyOn(adminClient, 'patch').mockRejectedValue(new Error('database unavailable'));
    await expect(adminApi.updateCustomer('c46b909a-e751-4c00-967e-8cdf1b41e4e2', { notes: 'Support note' })).rejects.toThrow();
  });
});
