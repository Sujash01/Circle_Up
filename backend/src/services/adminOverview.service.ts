import { ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';

export interface OverviewMetrics {
  liveProductsCount: number;
  lowStockCount: number;
  activeOrdersCount: number;
  totalRevenuePaise: number;
  totalOrdersCount: number;
}

export const adminOverviewService = {
  async getMetrics(): Promise<OverviewMetrics> {
    if (!isSupabaseConfigured()) {
      throw new ServiceUnavailableError('Database is unavailable.', 'DATABASE_UNAVAILABLE');
    }

    const client = getSupabaseAdminClient();

    // 1. Prefer server-side RPC if available (Resolves P1-6)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpcRes = await (client as any).rpc('admin_get_overview_metrics');
      if (!rpcRes?.error && rpcRes?.data && typeof rpcRes.data === 'object') {
        return {
          liveProductsCount: Number(rpcRes.data.liveProductsCount || 0),
          lowStockCount: Number(rpcRes.data.lowStockCount || 0),
          activeOrdersCount: Number(rpcRes.data.activeOrdersCount || 0),
          totalRevenuePaise: Number(rpcRes.data.totalRevenuePaise || 0),
          totalOrdersCount: Number(rpcRes.data.totalOrdersCount || 0),
        };
      }
    } catch {
      // Fall through to query aggregates
    }

    // 2. Query true database aggregates across all products and orders
    try {
      const [prodRes, orderRes] = await Promise.all([
        client.from('products').select('status, stock'),
        client.from('orders').select('status, payment_status, total_amount'),
      ]);

      if (prodRes.error || orderRes.error) {
        throw new ServiceUnavailableError('Failed to retrieve overview metrics from database.', 'DATABASE_UNAVAILABLE');
      }

      const products = Array.isArray(prodRes.data) ? prodRes.data : [];
      const orders = Array.isArray(orderRes.data) ? orderRes.data : [];

      const liveProductsCount = products.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.status === 'PUBLISHED' || p.status === 'ACTIVE',
      ).length;

      const lowStockCount = products.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.stock > 0 && p.stock <= 2 && p.status !== 'ARCHIVED' && p.status !== 'DRAFT',
      ).length;

      const activeOrdersCount = orders.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => o.status === 'PENDING' || o.status === 'CONFIRMED',
      ).length;

      // Realized paid revenue only (excluding unpaid COD, cancelled, and refunded orders)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalRevenuePaise = orders.reduce((sum: number, o: any) => {
        const isPaid = o.payment_status === 'PAID';
        const isCancelledOrRefunded =
          o.status === 'CANCELLED' || o.status === 'REFUNDED' || o.payment_status === 'REFUNDED';
        return isPaid && !isCancelledOrRefunded ? sum + Number(o.total_amount || 0) : sum;
      }, 0);

      return {
        liveProductsCount,
        lowStockCount,
        activeOrdersCount,
        totalRevenuePaise,
        totalOrdersCount: orders.length,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableError) throw err;
      throw new ServiceUnavailableError('Failed to calculate overview metrics.', 'DATABASE_UNAVAILABLE');
    }
  },
};
