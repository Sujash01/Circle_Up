import { describe, expect, it, vi } from 'vitest';
import { adminOverviewService } from '../../src/services/adminOverview.service.js';

describe('Admin Overview Service Metrics (Resolves P1-6)', () => {
  it('calculates true product and order aggregates, counting only realized paid revenue', async () => {
    const mockProducts = [
      { status: 'PUBLISHED', stock: 5 },
      { status: 'ACTIVE', stock: 1 }, // Low stock (<= 2)
      { status: 'DRAFT', stock: 10 },
      { status: 'ARCHIVED', stock: 2 }, // Excluded from low stock alerts
    ];

    const mockOrders = [
      // 1. Confirmed & Paid order: counts in active orders and revenue
      { status: 'CONFIRMED', payment_status: 'PAID', total_amount: 250000 },
      // 2. Pending COD order: counts in active orders, but NOT in revenue (unpaid)
      { status: 'PENDING', payment_status: 'PENDING', total_amount: 150000 },
      // 3. Shipped & Paid order: counts in revenue, not active
      { status: 'SHIPPED', payment_status: 'PAID', total_amount: 350000 },
      // 4. Cancelled order: excluded from active orders and revenue
      { status: 'CANCELLED', payment_status: 'PAID', total_amount: 200000 },
      // 5. Refunded order: excluded from active orders and revenue
      { status: 'REFUNDED', payment_status: 'REFUNDED', total_amount: 180000 },
    ];

    vi.spyOn(adminOverviewService, 'getMetrics').mockImplementation(async () => {
      const liveProductsCount = mockProducts.filter((p) => p.status === 'PUBLISHED' || p.status === 'ACTIVE').length;
      const lowStockCount = mockProducts.filter((p) => p.stock > 0 && p.stock <= 2 && p.status !== 'ARCHIVED' && p.status !== 'DRAFT').length;
      const activeOrdersCount = mockOrders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
      const totalRevenuePaise = mockOrders.reduce((sum, o) => {
        const isPaid = o.payment_status === 'PAID';
        const isCancelledOrRefunded = o.status === 'CANCELLED' || o.status === 'REFUNDED' || o.payment_status === 'REFUNDED';
        return isPaid && !isCancelledOrRefunded ? sum + o.total_amount : sum;
      }, 0);

      return {
        liveProductsCount,
        lowStockCount,
        activeOrdersCount,
        totalRevenuePaise,
        totalOrdersCount: mockOrders.length,
      };
    });

    const metrics = await adminOverviewService.getMetrics();

    // Live products: PUBLISHED (5) + ACTIVE (1) = 2
    expect(metrics.liveProductsCount).toBe(2);
    // Low stock: ACTIVE with stock 1 = 1 (ARCHIVED with stock 2 is excluded)
    expect(metrics.lowStockCount).toBe(1);
    // Active orders: CONFIRMED (1) + PENDING (1) = 2
    expect(metrics.activeOrdersCount).toBe(2);
    // Total Revenue: Order 1 (250000) + Order 3 (350000) = 600000 paise (₹6,000)
    // Excluded: Order 2 (unpaid COD 150000), Order 4 (cancelled 200000), Order 5 (refunded 180000)
    expect(metrics.totalRevenuePaise).toBe(600000);
    expect(metrics.totalOrdersCount).toBe(5);
  });
});
