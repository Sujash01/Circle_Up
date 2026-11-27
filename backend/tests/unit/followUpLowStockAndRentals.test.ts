import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasPermission } from '@circleup/shared';

const mockGetSupabaseAdminClient = vi.fn();

vi.mock('../../src/services/supabase.service.js', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdminClient: () => mockGetSupabaseAdminClient(),
}));

import { adminOverviewService } from '../../src/services/adminOverview.service.js';

describe('Follow-up Fixes: Low-Stock New Items Only & Rentals RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts only new items (Fresh Find / New With Tags) in lowStockCount when RPC is unavailable', async () => {
    const productRows = [
      { status: 'ACTIVE', stock: 1, product_type: 'Pre-Loved', condition: 'Mint' },
      { status: 'ACTIVE', stock: 1, product_type: 'Pre-Loved', condition: 'Vintage Wear' },
      { status: 'ACTIVE', stock: 2, product_type: 'Fresh Find', condition: 'Mint' },
      { status: 'ACTIVE', stock: 1, product_type: 'Pre-Loved', condition: 'New With Tags' },
      { status: 'DRAFT', stock: 1, product_type: 'Fresh Find', condition: 'New With Tags' },
      { status: 'ACTIVE', stock: 5, product_type: 'Fresh Find', condition: 'New With Tags' },
    ];

    mockGetSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc missing' } }),
      from: vi.fn((table: string) => ({
        select: vi.fn().mockResolvedValue({
          data: table === 'products' ? productRows : [],
          error: null,
        }),
      })),
    });

    const metrics = await adminOverviewService.getMetrics();
    expect(metrics.lowStockCount).toBe(2);
    expect(metrics.liveProductsCount).toBe(5);
  });

  it('overrides stale RPC lowStockCount to exclude thrift/used items', async () => {
    const lowStockCandidates = [
      { status: 'ACTIVE', stock: 1, product_type: 'Pre-Loved', condition: 'Gently Used' },
      { status: 'ACTIVE', stock: 2, product_type: 'Fresh Find', condition: 'New With Tags' },
    ];

    mockGetSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          liveProductsCount: 10,
          lowStockCount: 8,
          activeOrdersCount: 3,
          totalRevenuePaise: 500000,
          totalOrdersCount: 12,
        },
        error: null,
      }),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          gt: vi.fn(() => ({
            lte: vi.fn().mockResolvedValue({ data: lowStockCandidates, error: null }),
          })),
        })),
      })),
    });

    const metrics = await adminOverviewService.getMetrics();
    expect(metrics.lowStockCount).toBe(1);
    expect(metrics.liveProductsCount).toBe(10);
  });

  it('grants rentals_events:view when user has rentals_events:manage or legacy rentals permissions', () => {
    expect(hasPermission({ role: 'owner', permissions: [] }, 'rentals_events:view')).toBe(true);
    expect(hasPermission({ role: 'staff', permissions: ['rentals_events:manage'] }, 'rentals_events:view')).toBe(true);
    expect(hasPermission({ role: 'staff', permissions: ['rentals:view'] }, 'rentals_events:view')).toBe(true);
    expect(hasPermission({ role: 'staff', permissions: ['rentals:manage'] }, 'rentals_events:view')).toBe(true);
    expect(hasPermission({ role: 'staff', permissions: ['products:view'] }, 'rentals_events:view')).toBe(false);
  });
});
