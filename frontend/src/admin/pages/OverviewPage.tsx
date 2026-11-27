import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../services/adminApi';
import { AdminCardSkeleton, AdminTableSkeleton } from '../components/AdminSkeleton';
import { formatPrice, type Order } from '@circleup/shared';
import {
  Package,
  AlertTriangle,
  ShoppingBag,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
} from 'lucide-react';

export function OverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState({
    liveProductsCount: 0,
    lowStockCount: 0,
    activeOrdersCount: 0,
    totalRevenuePaise: 0,
    totalOrdersCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadOverview = async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      // Load true database aggregates via /api/admin/overview (Resolves P1-6)
      const overview = await adminApi.getOverview();
      setMetrics(overview.metrics);
      setOrders(overview.recentOrders || []);
    } catch {
      // Fallback gracefully to direct paginated lists if overview endpoint is unavailable
      try {
        const [prodData, orderData] = await Promise.all([
          adminApi.getProducts({ limit: 48 }),
          adminApi.getOrders({ limit: 10 }),
        ]);
        setOrders(orderData.data || []);
        setMetrics({
          liveProductsCount: (prodData.data || []).filter((p) => p.status === 'PUBLISHED' || p.status === 'ACTIVE').length,
          lowStockCount: (prodData.data || []).filter(
            (p) =>
              p.stock > 0 &&
              p.stock <= 2 &&
              p.status !== 'ARCHIVED' &&
              p.status !== 'DRAFT' &&
              (p.productType === 'Fresh Find' || p.condition === 'New With Tags'),
          ).length,
          activeOrdersCount: (orderData.data || []).filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length,
          totalRevenuePaise: (orderData.data || []).reduce((sum, o) => sum + (o.paymentStatus === 'PAID' && o.status !== 'CANCELLED' && o.status !== 'REFUNDED' ? o.totalAmount : 0), 0),
          totalOrdersCount: orderData.meta?.total || orderData.data?.length || 0,
        });
      } catch (fallbackErr: unknown) {
        setLoadError(fallbackErr instanceof Error ? fallbackErr.message : 'Unable to load dashboard overview.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const publishedCount = metrics.liveProductsCount;
  const lowStockCount = metrics.lowStockCount;
  const newOrdersCount = metrics.activeOrdersCount;
  const totalRevenuePaise = metrics.totalRevenuePaise;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <AdminCardSkeleton count={4} />
        <AdminTableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900 flex items-center justify-between gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="px-3 py-1 rounded-lg border border-red-300 bg-white font-semibold hover:bg-red-100 transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-5 rounded-2xl border border-[#1e2a1c]/10 bg-white/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/70 block">
              Live Products
            </span>
            <span className="text-3xl font-serif font-bold text-[#1e2a1c] block">{publishedCount}</span>
            <span className="text-[0.72rem] text-emerald-800 font-semibold flex items-center gap-1">
              <Sparkles className="size-3" />
              On Storefront Rail
            </span>
          </div>
          <div className="size-12 rounded-2xl bg-[#1e2a1c]/5 flex items-center justify-center text-[#1e2a1c]">
            <Package className="size-6" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-2xl border border-[#1e2a1c]/10 bg-white/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/70 block">
              Low Stock Alerts
            </span>
            <span className="text-3xl font-serif font-bold text-[#8b5a3e] block">{lowStockCount}</span>
            <span className="text-[0.72rem] text-[#8b5a3e] font-semibold flex items-center gap-1">
              <AlertTriangle className="size-3" />
              ≤ 2 items left
            </span>
          </div>
          <div className="size-12 rounded-2xl bg-amber-50 flex items-center justify-center text-[#8b5a3e]">
            <AlertTriangle className="size-6" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-2xl border border-[#1e2a1c]/10 bg-white/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/70 block">
              Active Orders
            </span>
            <span className="text-3xl font-serif font-bold text-[#1e2a1c] block">{newOrdersCount}</span>
            <span className="text-[0.72rem] text-blue-800 font-semibold flex items-center gap-1">
              <Clock className="size-3" />
              Pending / Confirmed
            </span>
          </div>
          <div className="size-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-900">
            <ShoppingBag className="size-6" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-2xl border border-[#1e2a1c]/10 bg-white/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/70 block">
              Total Volume
            </span>
            <span className="text-2xl font-serif font-bold text-[#1e2a1c] block tabular-nums">
              {formatPrice(totalRevenuePaise)}
            </span>
            <span className="text-[0.72rem] text-emerald-800 font-semibold flex items-center gap-1">
              <TrendingUp className="size-3" />
              Recorded Sales
            </span>
          </div>
          <div className="size-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-900">
            <TrendingUp className="size-6" />
          </div>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="p-6 rounded-3xl border border-[#1e2a1c]/10 bg-[#fcfbf7] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-bold text-[#1e2a1c]">Quick Actions</h2>
          <p className="text-xs text-[#1e2a1c]/70">Add a freshly measured piece or curate the homepage rails.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/products/new"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-semibold hover:bg-[#1e2a1c]/90 transition-all shadow-sm"
          >
            <Plus className="size-4" />
            Add Thrift Product
          </Link>
          <Link
            to="/admin/collections"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1e2a1c]/20 bg-white/80 text-[#1e2a1c] text-xs font-semibold hover:bg-white transition-all shadow-xs"
          >
            Curate Homepage Rails
          </Link>
        </div>
      </div>

      {/* Recent Orders Overview Table */}
      <div className="p-6 rounded-3xl border border-[#1e2a1c]/10 bg-white/70 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="font-serif text-lg font-bold text-[#1e2a1c]">Recent Customer Orders</h2>
            <p className="text-xs text-[#1e2a1c]/70">Latest thrift parcel enquiries and checkouts.</p>
          </div>
          <Link
            to="/admin/orders"
            className="flex items-center gap-1 text-xs font-semibold text-[#8b5a3e] hover:text-[#1e2a1c] transition-colors"
          >
            <span>View All Orders</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-[#1e2a1c]/20 text-[#1e2a1c]/60 text-xs">
            No customer orders recorded yet. Place an order on the storefront to test!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1e2a1c]/10 text-[#8b5a3e] uppercase font-bold text-[0.68rem] tracking-wider">
                  <th className="py-2.5 px-3">Order Number</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Items</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a1c]/5">
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.orderNumber} className="hover:bg-[#1e2a1c]/5 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-[#1e2a1c]">{order.orderNumber}</td>
                    <td className="py-3 px-3">
                      <span className="font-semibold block">{order.customer.name}</span>
                      <span className="text-[0.68rem] text-[#1e2a1c]/60">{order.customer.phone}</span>
                    </td>
                    <td className="py-3 px-3">{order.items?.length || 1} item(s)</td>
                    <td className="py-3 px-3 text-right font-semibold tabular-nums text-[#1e2a1c]">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                          order.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.status === 'SHIPPED'
                              ? 'bg-blue-100 text-blue-800'
                              : order.status === 'CANCELLED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-[#1e2a1c]/60">
                      {new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default OverviewPage;
