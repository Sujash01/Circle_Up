import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Eye,
  Printer,
  Calendar,
  User,
  MapPin,
  Clock,
  CheckCircle,
  Truck,
  Package,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';
import { PackingSlipModal } from '../components/PackingSlipModal';
import type { Order, OrderStatus } from '@circleup/shared';
import { formatPrice, ORDER_STATUS_TRANSITIONS } from '@circleup/shared';

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  PENDING: {
    label: 'Pending',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: Clock,
  },
  CONFIRMED: {
    label: 'Confirmed',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: CheckCircle,
  },
  PACKED: {
    label: 'Packed',
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    icon: Package,
  },
  SHIPPED: {
    label: 'Shipped',
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    icon: Truck,
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for Delivery',
    bg: 'bg-teal-100',
    text: 'text-teal-800',
    icon: Truck,
  },
  DELIVERED: {
    label: 'Delivered',
    bg: 'bg-primary/15',
    text: 'text-primary',
    icon: Package,
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: XCircle,
  },
  RETURN_REQUESTED: {
    label: 'Return Requested',
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: AlertCircle,
  },
  RETURNED: {
    label: 'Returned',
    bg: 'bg-zinc-100',
    text: 'text-zinc-800',
    icon: Package,
  },
  REFUNDED: {
    label: 'Refunded',
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    icon: CheckCircle,
  },
};

const ALLOWED_TRANSITIONS = ORDER_STATUS_TRANSITIONS;

export default function OrdersPage() {
  const { showToast } = useAdminToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [packingSlipOrder, setPackingSlipOrder] = useState<Order | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [verifyPaymentOrder, setVerifyPaymentOrder] = useState<Order | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [paymentProofInput, setPaymentProofInput] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getOrders({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search.trim() || undefined,
        limit: 50,
      });
      setOrders(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch orders';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, showToast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const handleStatusTransition = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingStatus(true);
    try {
      const updated = await adminApi.updateOrderStatus(orderId, nextStatus);
      showToast('success', `Order status updated to ${nextStatus}`);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update order status';
      showToast('error', msg);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmPaymentVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPaymentOrder) return;
    setVerifyingPayment(true);
    try {
      const updated = await adminApi.markOrderPaymentReceived(verifyPaymentOrder.id || '', {
        utrNumber: utrInput.trim() || undefined,
        paymentProofUrl: paymentProofInput.trim() || undefined,
      });
      showToast('success', `Payment verified and recorded for ${updated.orderNumber}`);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      if (selectedOrder?.id === updated.id) {
        setSelectedOrder(updated);
      }
      setVerifyPaymentOrder(null);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to record payment verification.');
    } finally {
      setVerifyingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Orders</h1>
          <p className="text-xs text-cocoa/70">
            Fulfill and track customer orders, update statuses, and generate packing slips.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-cocoa/50" />
          <input
            type="text"
            placeholder="Search by Order #, customer name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-cocoa focus:border-primary focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter className="size-4 text-cocoa/50 shrink-0" />
          {['ALL', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-cocoa/70 border border-border hover:text-cocoa'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <AdminTableSkeleton rows={6} />
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Package className="size-10 mx-auto text-cocoa/30 mb-3" />
          <p className="text-sm font-semibold text-cocoa">No orders found</p>
          <p className="text-xs text-cocoa/60 mt-1">
            {statusFilter !== 'ALL'
              ? `No orders matching filter "${statusFilter}"`
              : 'New customer orders will appear here once placed.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-cocoa font-bold">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {orders.map((order) => {
                const conf = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
                const Icon = conf.icon;
                return (
                  <tr key={order.id} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-cocoa">
                      {order.orderNumber}
                    </td>
                    <td className="py-3 px-4 text-cocoa/70">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-cocoa">{order.customer.name}</p>
                      <p className="text-[0.7rem] text-cocoa/60">{order.customer.email}</p>
                    </td>
                    <td className="py-3 px-4 text-cocoa/80">{order.items.length} item(s)</td>
                    <td className="py-3 px-4 font-bold text-terracotta">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${conf.bg} ${conf.text}`}
                      >
                        <Icon className="size-3" />
                        {conf.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        title="View Order Details"
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-cocoa/70 hover:text-primary hover:border-primary transition-colors"
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        onClick={() => setPackingSlipOrder(order)}
                        title="Print Packing Slip"
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-cocoa/70 hover:text-primary hover:border-primary transition-colors"
                      >
                        <Printer className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Detail Modal / Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-cocoa">
                  Order #{selectedOrder.orderNumber}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-cocoa/70">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    {selectedOrder.createdAt
                      ? new Date(selectedOrder.createdAt).toLocaleString('en-IN')
                      : '—'}
                  </span>
                  <span>•</span>
                  <span>Payment: {selectedOrder.paymentMethod}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-cocoa/60 hover:text-cocoa font-bold text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Status Transition Control */}
            <div className="rounded-xl border border-border/80 bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cocoa uppercase tracking-wider">
                  Order Status Management
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    STATUS_CONFIG[selectedOrder.status]?.bg
                  } ${STATUS_CONFIG[selectedOrder.status]?.text}`}
                >
                  {STATUS_CONFIG[selectedOrder.status]?.label}
                </span>
              </div>

              {ALLOWED_TRANSITIONS[selectedOrder.status]?.length > 0 ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-cocoa/70">Transition to:</span>
                  {ALLOWED_TRANSITIONS[selectedOrder.status].map((nextSt) => (
                    <button
                      key={nextSt}
                      disabled={updatingStatus}
                      onClick={() => handleStatusTransition(selectedOrder.id || '', nextSt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                        nextSt === 'CANCELLED'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-primary text-primary-foreground hover:bg-forest-deep'
                      }`}
                    >
                      Mark as {STATUS_CONFIG[nextSt]?.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-cocoa/60 italic">
                  This order is in a terminal state ({selectedOrder.status}). No further transitions
                  allowed.
                </p>
              )}
            </div>

            {/* Payment Verification Status */}
            <div className="rounded-xl border border-border/80 bg-background p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cocoa">Payment:</span>
                  <span className={`px-2 py-0.5 rounded text-[0.7rem] font-bold ${
                    selectedOrder.paymentStatus === 'PAID'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedOrder.paymentStatus}
                  </span>
                  <span className="text-xs text-cocoa/70 font-medium">({selectedOrder.paymentMethod})</span>
                </div>
                {selectedOrder.utrNumber && (
                  <p className="text-xs text-cocoa/80 font-mono">
                    <span className="text-cocoa/60 font-sans">UTR / Ref:</span> {selectedOrder.utrNumber}
                  </p>
                )}
                {selectedOrder.paymentProofUrl && (
                  <p className="text-xs text-forest">
                    <a href={selectedOrder.paymentProofUrl} target="_blank" rel="noreferrer" className="underline font-semibold">
                      View Payment Proof
                    </a>
                  </p>
                )}
              </div>

              {selectedOrder.paymentStatus !== 'PAID' && ['WHATSAPP_UPI', 'CASH_ON_DELIVERY'].includes(selectedOrder.paymentMethod) && (
                <button
                  type="button"
                  onClick={() => {
                    setVerifyPaymentOrder(selectedOrder);
                    setUtrInput(selectedOrder.utrNumber || '');
                    setPaymentProofInput(selectedOrder.paymentProofUrl || '');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors shadow-sm"
                >
                  Verify Payment Receipt
                </button>
              )}
            </div>

            {/* Customer & Shipping Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/80 bg-background p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <User className="size-4" />
                  Customer Details
                </div>
                <p className="text-xs font-semibold text-cocoa">{selectedOrder.customer.name}</p>
                <p className="text-xs text-cocoa/70">{selectedOrder.customer.email}</p>
                <p className="text-xs text-cocoa/70">{selectedOrder.customer.phone}</p>
              </div>

              <div className="rounded-xl border border-border/80 bg-background p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <MapPin className="size-4" />
                  Shipping Address
                </div>
                <p className="text-xs text-cocoa/80 leading-relaxed">
                  {selectedOrder.shippingAddress.addressLine}
                  {selectedOrder.shippingAddress.landmark && (
                    <>, Near {selectedOrder.shippingAddress.landmark}</>
                  )}
                  <br />
                  {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} -{' '}
                  {selectedOrder.shippingAddress.postalCode}
                  <br />
                  {selectedOrder.shippingAddress.country}
                </p>
              </div>
            </div>

            {/* Order Items */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-cocoa uppercase tracking-wider">Order Items</h3>
              <div className="divide-y divide-border rounded-xl border border-border bg-background overflow-hidden">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 text-xs">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="size-12 rounded object-cover border border-border shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-cocoa truncate">{item.name}</p>
                      <p className="text-[0.7rem] text-cocoa/60">
                        {item.size ? `Size: ${item.size} • ` : ''}Qty: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-terracotta">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                      <p className="text-[0.65rem] text-cocoa/50">
                        {formatPrice(item.price)} each
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price Breakdown */}
              <div className="rounded-xl border border-border bg-background p-4 space-y-1.5 text-xs text-cocoa/80">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatPrice(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-green-700 font-semibold">
                    <span>Discount {selectedOrder.promoCode ? `(${selectedOrder.promoCode})` : ''}:</span>
                    <span>-{formatPrice(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping:</span>
                  <span>
                    {selectedOrder.deliveryFee === 0
                      ? 'FREE'
                      : formatPrice(selectedOrder.deliveryFee)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-bold text-sm text-cocoa">
                  <span>Total Amount:</span>
                  <span className="text-terracotta">{formatPrice(selectedOrder.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  setPackingSlipOrder(selectedOrder);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-cocoa hover:text-primary transition-colors"
              >
                <Printer className="size-4" />
                Print Packing Slip
              </button>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-forest-deep transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Packing Slip */}
      {packingSlipOrder && (
        <PackingSlipModal
          order={packingSlipOrder}
          onClose={() => setPackingSlipOrder(null)}
        />
      )}

      {/* Manual Payment Verification Modal (P2-8) */}
      {verifyPaymentOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setVerifyPaymentOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-display text-lg font-bold text-cocoa">
                Verify Manual Payment Receipt
              </h2>
              <p className="text-xs text-cocoa/70 mt-0.5">
                Order {verifyPaymentOrder.orderNumber} • Total {formatPrice(verifyPaymentOrder.totalAmount)}
              </p>
            </div>

            <form onSubmit={handleConfirmPaymentVerification} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">
                  UPI Reference / UTR Number
                </label>
                <input
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="e.g. 432819284712 (12-digit UPI UTR)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">
                  Payment Proof URL / Receipt Reference
                </label>
                <input
                  type="text"
                  value={paymentProofInput}
                  onChange={(e) => setPaymentProofInput(e.target.value)}
                  placeholder="https://... receipt image or payment notes"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVerifyPaymentOrder(null)}
                  className="px-4 py-2 text-xs font-semibold text-cocoa/70 hover:text-cocoa border border-border rounded-lg bg-background"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingPayment}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {verifyingPayment ? 'Verifying...' : 'Confirm Payment Received'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
