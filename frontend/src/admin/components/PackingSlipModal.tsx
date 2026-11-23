import { formatPrice, type Order } from '@circleup/shared';
import { Printer, X, CheckCircle, Clock, AlertCircle, RefreshCw, XCircle } from 'lucide-react';

function getPaymentBadge(order: Order) {
  if (order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED') {
    return {
      label: 'Refunded',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      totalLabel: 'Refunded Amount',
      balanceDue: 0,
      icon: RefreshCw,
      note: 'Payment has been refunded and reconciled to the customer account.',
    };
  }
  if (order.status === 'CANCELLED') {
    return {
      label: 'Cancelled',
      badgeClass: 'bg-red-100 text-red-900 border-red-300',
      totalLabel: 'Order Value (Cancelled)',
      balanceDue: 0,
      icon: XCircle,
      note: 'Order was cancelled. Zero payment is due and items are returned to inventory.',
    };
  }
  if (order.paymentStatus === 'PAID') {
    return {
      label: 'Paid in Full',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      totalLabel: 'Total Paid',
      balanceDue: 0,
      icon: CheckCircle,
      note: 'Payment received and verified in full prior to dispatch.',
    };
  }
  if (order.paymentMethod === 'CASH_ON_DELIVERY') {
    return {
      label: 'Payment Due on Delivery (COD)',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      totalLabel: 'Amount Due on Delivery',
      balanceDue: order.totalAmount,
      icon: Clock,
      note: 'Cash on delivery: Collect full payment amount in cash before handing parcel to customer.',
    };
  }
  if (order.paymentMethod === 'WHATSAPP_UPI') {
    return {
      label: 'Verification Pending (WhatsApp / UPI)',
      badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
      totalLabel: 'Amount Pending Verification',
      balanceDue: order.totalAmount,
      icon: Clock,
      note: 'WhatsApp / UPI: Awaiting confirmation of bank / UPI transfer receipt.',
    };
  }
  return {
    label: 'Payment Pending',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    totalLabel: 'Amount Due',
    balanceDue: order.totalAmount,
    icon: AlertCircle,
    note: 'Payment verification is pending for this shipment.',
  };
}

export function PackingSlipModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const handlePrint = () => {
    window.print();
  };

  const paymentState = getPaymentBadge(order);
  const StatusIcon = paymentState.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="slip-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#fcfbf7] border border-[#1e2a1c]/20 rounded-3xl max-w-2xl w-full p-6 sm:p-10 shadow-2xl relative text-[#1e2a1c] space-y-6 print:m-0 print:p-0 print:border-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#1e2a1c]/15 print:hidden">
          <span className="font-serif text-lg font-bold">Printable Tax Invoice &amp; Packing Slip</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-semibold hover:bg-[#1e2a1c]/90 transition-all shadow-sm"
            >
              <Printer className="size-4" />
              Print Slip
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[#1e2a1c]/10 text-[#1e2a1c] transition-colors"
              aria-label="Close modal"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Printable Slip Content */}
        <div className="space-y-6">
          <div className="flex justify-between items-start border-b border-[#1e2a1c]/15 pb-6">
            <div>
              <h2 id="slip-title" className="font-serif text-3xl font-bold tracking-tight">CircleUp</h2>
              <p className="text-xs uppercase tracking-widest text-[#8b5a3e] font-semibold mt-0.5">
                Curated Thrift &amp; Sustainable Rewear
              </p>
              <p className="text-xs text-[#1e2a1c]/70 mt-1">Sector 7 Studio Courtyard, Madhya Marg, Chandigarh 160019</p>
              <p className="text-xs text-[#1e2a1c]/70">GSTIN: 03AABCC1234F1Z8 • care@circleuponline.com • Plastic-Free Packaging</p>
            </div>
            <div className="text-right space-y-1">
              <span className="text-[0.68rem] uppercase font-bold tracking-wider text-[#8b5a3e] block">Tax Invoice / Packing Slip</span>
              <span className="font-mono text-base font-bold text-[#1e2a1c] block">{order.orderNumber}</span>
              <p className="text-xs text-[#1e2a1c]/70">
                Date:{' '}
                {new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              <div className="pt-1">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold border ${paymentState.badgeClass}`}>
                  <StatusIcon className="size-3" />
                  {paymentState.label}
                </span>
              </div>
            </div>
          </div>

          {/* Customer, Shipping & Fulfillment Meta */}
          <div className="grid grid-cols-2 gap-6 bg-[#1e2a1c]/5 p-4 rounded-2xl border border-[#1e2a1c]/10 text-xs">
            <div>
              <span className="font-bold text-[#8b5a3e] uppercase tracking-wider block mb-1">Deliver To</span>
              <p className="font-semibold text-sm">{order.customer.name}</p>
              <p>{order.customer.phone}</p>
              <p>{order.customer.email}</p>
              <div className="mt-2 pt-2 border-t border-[#1e2a1c]/10 text-[0.72rem] text-[#1e2a1c]/75">
                <span className="font-semibold text-[#8b5a3e]">Fulfillment Status: </span>
                <span className="font-mono font-bold">{order.status}</span>
              </div>
            </div>
            <div>
              <span className="font-bold text-[#8b5a3e] uppercase tracking-wider block mb-1">Shipping Address</span>
              <p>{order.shippingAddress.addressLine}</p>
              {order.shippingAddress.landmark && <p>Near: {order.shippingAddress.landmark}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}
              </p>
              <div className="mt-2 pt-2 border-t border-[#1e2a1c]/10 text-[0.72rem] text-[#1e2a1c]/75">
                <span className="font-semibold text-[#8b5a3e]">Payment Method: </span>
                <span className="font-semibold">
                  {order.paymentMethod === 'CASH_ON_DELIVERY'
                    ? 'Cash on Delivery (COD)'
                    : order.paymentMethod === 'WHATSAPP_UPI'
                      ? 'WhatsApp / UPI'
                      : order.paymentMethod}
                </span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e2a1c]/20 text-[#8b5a3e] uppercase font-bold text-[0.65rem] tracking-wider">
                <th className="py-2">Item</th>
                <th className="py-2">SKU / Serial</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2a1c]/10">
              {order.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 font-medium">
                    {item.name}
                    {item.size && <span className="block text-[#8b5a3e] text-[0.68rem]">{item.size}</span>}
                  </td>
                  <td className="py-3 font-mono text-[#1e2a1c]/70">{item.serialNumber}</td>
                  <td className="py-3 text-center font-bold">{item.quantity}</td>
                  <td className="py-3 text-right font-medium tabular-nums">{formatPrice(item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Order Summary & Billing State */}
          <div className="pt-4 border-t border-[#1e2a1c]/15 flex justify-end">
            <div className="w-72 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#1e2a1c]/80">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span>Discount</span>
                  <span className="tabular-nums">- {formatPrice(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#1e2a1c]/80">
                <span>Delivery</span>
                <span>{order.deliveryFee === 0 ? 'FREE' : formatPrice(order.deliveryFee)}</span>
              </div>

              {/* Total Row displaying accurate payment status (Resolves P1-7) */}
              <div className="flex justify-between font-bold text-sm text-[#1e2a1c] pt-2 border-t border-[#1e2a1c]/15">
                <span>{paymentState.totalLabel}</span>
                <span className="tabular-nums">{formatPrice(order.totalAmount)}</span>
              </div>

              {paymentState.balanceDue > 0 ? (
                <div className="flex justify-between font-bold text-xs text-amber-900 pt-1">
                  <span>Amount to Collect</span>
                  <span className="tabular-nums">{formatPrice(paymentState.balanceDue)}</span>
                </div>
              ) : order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED' ? (
                <div className="flex justify-between font-bold text-xs text-emerald-900 pt-1">
                  <span>Net Amount Due</span>
                  <span className="tabular-nums">₹0</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Payment & Care Guidance */}
          <div className="p-3.5 rounded-xl border border-[#1e2a1c]/15 bg-[#1e2a1c]/5 text-[0.72rem] text-[#1e2a1c]/85 space-y-1">
            <p className="font-semibold text-[#8b5a3e]">{paymentState.note}</p>
            <p className="text-[#1e2a1c]/70">
              Thank you for choosing pre-loved fashion! Every piece swapped or rewritten reduces textile waste.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

