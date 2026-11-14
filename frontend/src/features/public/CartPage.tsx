import { CheckCircle2, Copy, ExternalLink, Minus, Package, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { Blob } from '@/components/ui/Blob';
import { useStore } from '@/context/StoreContext';
import { apiClient } from '@/services/apiClient';
import { cartService, formatPrice } from '@/services/cartService';

type PaymentMethod = 'WHATSAPP_UPI' | 'CASH_ON_DELIVERY' | 'ONLINE_UPI';

function isPaymentMethod(value: string): value is PaymentMethod {
  return (
    value === 'WHATSAPP_UPI' ||
    value === 'CASH_ON_DELIVERY' ||
    value === 'ONLINE_UPI'
  );
}

interface PlacedOrderDetails {
  orderNumber: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
  };
  items: Array<{
    serialNumber: string;
    name: string;
    price: number;
    quantity: number;
    size?: string;
  }>;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
}

export function CartPage() {
  const {
    cart,
    totals,
    updateCartQuantity,
    removeFromCart,
    applyPromoCode,
    clearCart,
    showNotice,
  } = useStore();

  const [promoInput, setPromoInput] = useState(cart.promoCode ?? '');
  const [promoError, setPromoError] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  // Direct Online Checkout state
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [placedOrder, setPlacedOrder] = useState<PlacedOrderDetails | null>(null);

  // Checkout Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    addressLine: '',
    city: '',
    state: '',
    postalCode: '',
    paymentMethod: 'WHATSAPP_UPI' as PaymentMethod,
  });

  if (placedOrder) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-8">
        <div className="organic-panel border border-foreground/15 bg-card p-8 sm:p-10 space-y-6 shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <CheckCircle2 className="size-8" />
            <div>
              <p className="text-xs uppercase tracking-widest text-terracotta font-semibold">Order Confirmed</p>
              <h1 className="font-display text-3xl text-cocoa">Thank you, {placedOrder.customer.name}!</h1>
            </div>
          </div>

          <div className="border-y border-foreground/15 py-4 space-y-2 text-sm text-foreground/80">
            <p>
              Your order <strong className="font-mono text-cocoa">{placedOrder.orderNumber}</strong> has been saved directly to the database.
            </p>
            <p className="text-xs text-muted-foreground">
              A confirmation email will be sent to <strong>{placedOrder.customer.email}</strong>.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-cocoa">Itemized Summary</h2>
            <div className="divide-y divide-foreground/10 text-xs">
              {placedOrder.items.map((it, idx) => (
                <div key={idx} className="py-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-cocoa">{it.name}</span>
                    <span className="ml-2 font-mono text-[0.7rem] bg-secondary px-1.5 py-0.5 text-cocoa">
                      {it.serialNumber}
                    </span>
                    {it.size && <span className="ml-2 text-muted-foreground">Size: {it.size}</span>}
                  </div>
                  <span className="font-semibold text-cocoa">
                    {formatPrice(it.price * it.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-foreground/15 flex justify-between text-sm font-bold text-cocoa">
              <span>Total Paid / Payable</span>
              <span className="text-primary">{formatPrice(placedOrder.totalAmount)}</span>
            </div>
          </div>

          <div className="bg-secondary/60 p-4 border border-foreground/10 text-xs space-y-1">
            <p className="font-semibold uppercase tracking-wider text-cocoa">Shipping Address</p>
            <p className="text-foreground/80">{placedOrder.shippingAddress.addressLine}, {placedOrder.shippingAddress.city}, {placedOrder.shippingAddress.state} - {placedOrder.shippingAddress.postalCode}</p>
            <p className="text-foreground/80">Phone: {placedOrder.customer.phone}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Link
              to="/new-arrivals"
              onClick={() => setPlacedOrder(null)}
              className="flex-1 bg-primary py-3 text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <EmptyState
        title="Your shopping bag is empty"
        description="Explore curated pre-loved, handcrafted, and one-of-a-kind finds to add pieces to your bag."
        actionLabel="Continue Shopping"
        actionTo="/new-arrivals"
      />
    );
  }

  const whatsapp = cartService.buildWhatsAppCheckout(cart, customerNote);

  const handlePromoSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = applyPromoCode(promoInput);
    if (!res.ok && res.error) {
      setPromoError(res.error);
    } else {
      setPromoError('');
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsapp.message);
      showNotice('WhatsApp order summary copied to clipboard.');
    } catch {
      showNotice('Could not access clipboard automatically; select and copy the preview below.', 'error');
    }
  };

  const handleDirectOrderSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setOrderError('');

    if (!formData.name || !formData.email || !formData.phone) {
      setOrderError('Please provide your name, email, and mobile phone number.');
      return;
    }
    if (!formData.addressLine || !formData.city || !formData.state || !formData.postalCode) {
      setOrderError('Please complete your full delivery address.');
      return;
    }

    try {
      setIsSubmittingOrder(true);
      const payload = {
        customer: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
        },
        shippingAddress: {
          addressLine: formData.addressLine,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
        },
        items: cart.items.map((item) => ({
          serialNumber: item.productId.toUpperCase(),
          quantity: item.quantity,
          size: item.size,
        })),
        promoCode: cart.promoCode,
        paymentMethod: formData.paymentMethod,
        notes: customerNote,
      };

      const res = await apiClient.post<{ success: true; data: PlacedOrderDetails }>('/orders', payload);
      if (res.data?.success && res.data.data) {
        setPlacedOrder(res.data.data);
        clearCart();
        setIsCheckoutModalOpen(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to place order. Please check item availability.';
      setOrderError(msg);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-foreground/15 pb-6">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">
            Shopping Bag &amp; Enquiry
          </p>
          <h1 className="mt-2 font-display text-4xl text-cocoa">Your Bag ({totals.itemCount})</h1>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <span className="text-terracotta">
            Cart ID: <strong className="text-cocoa">{cart.cartId}</strong>
          </span>
          <button
            type="button"
            onClick={clearCart}
            className="inline-flex min-h-[44px] items-center text-destructive underline underline-offset-4 hover:opacity-80"
          >
            Clear bag
          </button>
        </div>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] items-start">
        {/* Itemized list */}
        <div className="divide-y divide-foreground/15">
          {cart.items.map((item) => (
            <div key={item.key} className="py-6 first:pt-0 flex gap-5 items-start">
              <Link to={`/product/${item.slug}`} className="w-24 sm:w-28 shrink-0 bg-tile">
                <Blob
                  src={item.image}
                  alt={item.name}
                  width={800}
                  height={1000}
                  shape="arch"
                  className="aspect-[4/5] w-full"
                  imageClassName="object-top"
                />
              </Link>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      to={`/product/${item.slug}`}
                      className="inline-flex min-h-[44px] items-center font-medium text-cocoa hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    <span className="font-mono text-[0.68rem] text-terracotta font-semibold uppercase">
                      SERIAL: {item.productId.toUpperCase()}
                    </span>
                  </div>
                  <span className="font-bold text-primary tabular-nums shrink-0">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>

                <p className="text-xs text-terracotta">
                  Option: <span className="font-medium text-cocoa">{item.variantLabel}</span>
                  {item.size && <span> · Size {item.size}</span>}
                </p>

                <p className="text-xs text-muted-foreground">
                  Price: {formatPrice(item.unitPrice)} each
                </p>

                <div className="flex items-center gap-4 pt-2">
                  <div className="organic-control inline-flex items-center border border-foreground/20">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => updateCartQuantity(item.key, item.quantity - 1)}
                      className="min-h-[44px] min-w-[44px] px-2 py-1 text-cocoa hover:bg-secondary/60"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="px-3 text-xs font-semibold tabular-nums text-cocoa">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={item.quantity >= item.maxStock}
                      onClick={() => updateCartQuantity(item.key, item.quantity + 1)}
                      className="min-h-[44px] min-w-[44px] px-2 py-1 text-cocoa hover:bg-secondary/60 disabled:opacity-40"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.key)}
                    className="inline-flex min-h-[44px] items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <Trash2 className="size-3" />
                    <span>Remove</span>
                  </button>

                  {item.maxStock === 1 && (
                    <span className="text-[0.68rem] font-medium text-terracotta italic">
                      Single piece curated find
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary & Actions */}
        <aside className="organic-panel border border-foreground/15 bg-card p-6 space-y-6 shadow-sm">
          <h2 className="font-display text-xl text-cocoa border-b border-foreground/15 pb-3">
            Bag Summary
          </h2>

          {/* Promo code */}
          <form onSubmit={handlePromoSubmit} className="space-y-2">
            <label htmlFor="promo-input" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
              Promo Code
            </label>
            <div className="flex gap-2">
              <input
                id="promo-input"
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="CIRCLEUP10"
                className="flex-1 border-b border-foreground/30 bg-transparent py-1.5 text-xs uppercase tracking-wider text-cocoa focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                className="bg-secondary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cocoa hover:bg-secondary/80"
              >
                Apply
              </button>
            </div>
            {promoError && <p className="text-[0.72rem] text-destructive">{promoError}</p>}
            {cart.promoCode && (
              <p className="text-[0.72rem] text-primary">Promo &lsquo;{cart.promoCode}&rsquo; applied</p>
            )}
          </form>

          {/* Price breakdowns */}
          <div className="space-y-2 border-y border-foreground/15 py-4 text-xs text-cocoa">
            <div className="flex justify-between">
              <span className="text-terracotta">Subtotal</span>
              <span className="tabular-nums font-medium">{formatPrice(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Discount ({totals.discountLabel || cart.promoCode})</span>
                <span className="tabular-nums font-medium">-{formatPrice(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-terracotta">Estimated Shipping</span>
              <span className="tabular-nums font-medium">
                {totals.subtotal >= 1999 ? 'Complimentary' : 'Calculated at Checkout'}
              </span>
            </div>
            {totals.subtotal < 1999 && (
              <p className="text-[0.68rem] text-muted-foreground">
                Complimentary shipping on orders over ₹1,999.
              </p>
            )}
            <div className="flex justify-between pt-2 border-t border-foreground/10 font-bold text-base text-cocoa">
              <span>Estimated Total</span>
              <span className="text-primary tabular-nums">{formatPrice(totals.estimatedTotal)}</span>
            </div>
          </div>

          {/* Primary Action: Direct Order Placement into Database */}
          <button
            type="button"
            onClick={() => setIsCheckoutModalOpen(true)}
            className="flex w-full items-center justify-center gap-2 bg-primary px-6 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep cursor-pointer"
          >
            <Package className="size-4" />
            <span>Place Order / Direct Checkout</span>
          </button>

          {/* WhatsApp option */}
          <div className="pt-2 border-t border-foreground/10 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-terracotta">
                Or Checkout via WhatsApp
              </span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
              >
                <Copy className="size-3" />
                <span>Copy</span>
              </button>
            </div>

            <a
              href={whatsapp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 border border-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary transition-colors hover:bg-primary/10"
            >
              <span>Enquire on WhatsApp</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </aside>
      </div>

      {/* Direct Order Checkout Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-card border border-foreground/20 p-6 sm:p-8 space-y-6 shadow-xl my-8">
            <button
              type="button"
              onClick={() => setIsCheckoutModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>

            <div>
              <p className="text-[0.72rem] uppercase tracking-widest text-terracotta font-semibold">CircleUp Thrift Store</p>
              <h2 className="font-display text-2xl text-cocoa">Complete Your Order</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Your order will be reserved and saved in our MongoDB store database.
              </p>
            </div>

            {orderError && (
              <div className="p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20">
                {orderError}
              </div>
            )}

            <form onSubmit={handleDirectOrderSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold uppercase tracking-wider text-cocoa">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Aanya Sharma"
                  className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold uppercase tracking-wider text-cocoa">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="aanya@example.com"
                    className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold uppercase tracking-wider text-cocoa">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98201 12233"
                    className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold uppercase tracking-wider text-cocoa">Delivery Street Address *</label>
                <input
                  type="text"
                  required
                  value={formData.addressLine}
                  onChange={(e) => setFormData({ ...formData, addressLine: e.target.value })}
                  placeholder="House/Flat No., Building, Street"
                  className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold uppercase tracking-wider text-cocoa">City *</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Mumbai"
                    className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold uppercase tracking-wider text-cocoa">State *</label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="Maharashtra"
                    className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold uppercase tracking-wider text-cocoa">PIN Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="400050"
                    className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="checkout-note" className="font-semibold uppercase tracking-wider text-cocoa">
                  Order note (optional)
                </label>
                <textarea
                  id="checkout-note"
                  rows={3}
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value)}
                  placeholder="Anything we should know about your order?"
                  className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold uppercase tracking-wider text-cocoa">Payment Option</label>
                <select
                  value={formData.paymentMethod}
                  onChange={(event) => {
                    if (isPaymentMethod(event.target.value)) {
                      setFormData({ ...formData, paymentMethod: event.target.value });
                    }
                  }}
                  className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                >
                  <option value="WHATSAPP_UPI">WhatsApp UPI / Pay on Chat</option>
                  <option value="CASH_ON_DELIVERY">Cash on Delivery (COD)</option>
                  <option value="ONLINE_UPI">Direct UPI Transfer</option>
                </select>
              </div>

              <div className="border-t border-foreground/15 pt-3 flex justify-between font-bold text-sm text-cocoa">
                <span>Total Amount Due</span>
                <span className="text-primary">{formatPrice(totals.estimatedTotal)}</span>
              </div>

              <button
                type="submit"
                disabled={isSubmittingOrder}
                className="w-full bg-primary py-3 text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingOrder ? 'Processing Order...' : 'Confirm & Place Thrift Order'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
