import { ArrowRight, Check, CheckCircle2, Copy, Minus, Package, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/app/store';
import { EmptyState } from '@/components/storefront/EmptyState';
import { Blob } from '@/components/ui/Blob';
import { useStore } from '@/context/StoreContext';
import { cn } from '@/lib/utils';
import { cartService, formatPrice } from '@/services/cartService';
import { orderService } from '@/services/orderService';

import type { PaymentMethod } from '@circleup/shared';

function WhatsAppIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.83 7.35C8.61 7.35 8.24 7.43 7.94 7.76C7.63 8.09 6.77 8.9 6.77 10.54C6.77 12.18 7.97 13.76 8.13 13.98C8.3 14.2 10.45 17.52 13.74 18.94C16.47 20.12 17.03 19.89 17.62 19.83C18.21 19.77 19.53 19.05 19.8 18.28C20.08 17.52 20.08 16.86 20 16.73C19.92 16.59 19.7 16.51 19.37 16.34C19.04 16.18 17.41 15.38 17.11 15.27C16.81 15.16 16.59 15.1 16.37 15.43C16.15 15.76 15.52 16.51 15.33 16.73C15.13 16.95 14.94 16.98 14.61 16.81C14.28 16.65 13.22 16.3 11.96 15.17C10.98 14.3 10.32 13.22 10.12 12.89C9.93 12.56 10.1 12.38 10.27 12.22C10.42 12.07 10.6 11.83 10.77 11.64C10.93 11.44 10.99 11.31 11.1 11.09C11.21 10.87 11.16 10.67 11.08 10.51C11 10.35 10.34 8.71 10.06 8.05C9.79 7.41 9.52 7.5 9.32 7.49C9.13 7.48 8.91 7.35 8.83 7.35Z" />
    </svg>
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
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
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
    paymentMethod: 'ONLINE_UPI' as PaymentMethod,
  });

  const authUser = useSelector((state: RootState) => state.auth.user);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#checkout-step2') {
      setIsCheckoutModalOpen(true);
      setCheckoutStep(2);
    }
  }, []);

  const handleOpenCheckout = () => {
    setOrderError('');
    setCheckoutStep(1);
    if (authUser) {
      setFormData((prev) => ({
        ...prev,
        name: prev.name || authUser.fullName || '',
        email: prev.email || authUser.email || '',
        phone: prev.phone || authUser.phone || '',
      }));
    }
    setIsCheckoutModalOpen(true);
  };

  const handleContinueToPayment = (e: FormEvent) => {
    e.preventDefault();
    setOrderError('');

    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      setOrderError('Please provide your full name, email, and mobile phone number.');
      return;
    }
    if (!formData.addressLine.trim() || !formData.city.trim() || !formData.state.trim() || !formData.postalCode.trim()) {
      setOrderError('Please complete your full delivery street address, city, state, and PIN code.');
      return;
    }
    setCheckoutStep(2);
  };

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
              Payment Method:{' '}
              <strong className="text-cocoa">
                Paid Online (Razorpay Gateway)
              </strong>
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

  if (cart.items.length === 0 && (typeof window === 'undefined' || window.location.hash !== '#checkout-step2')) {
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
      const deliveryFee = totals.subtotal - totals.discount >= 150000 ? 0 : 9000;

      const placed = await orderService.createOrder({
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
          name: item.name,
          price: item.unitPrice,
          quantity: item.quantity,
          size: item.size,
          image: item.image,
        })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        shippingFee: deliveryFee,
        totalAmount: totals.estimatedTotal,
        paymentMethod: formData.paymentMethod,
        notes: customerNote,
        customerId: authUser?.id,
      });

      setPlacedOrder({
        orderNumber: placed.orderNumber,
        customer: {
          name: placed.customerName,
          email: placed.customerEmail,
          phone: placed.customerPhone || '',
        },
        shippingAddress: {
          addressLine: formData.addressLine,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
        },
        items: placed.items.map((it) => ({
          serialNumber: it.serialNumber || it.name,
          name: it.name,
          price: it.price,
          quantity: it.qty,
          size: it.size,
        })),
        subtotal: placed.subtotal,
        discount: placed.discount,
        deliveryFee: placed.shippingFee,
        totalAmount: placed.totalAmount,
        paymentMethod: placed.paymentMethod,
        createdAt: placed.createdAt,
      });

      clearCart();
      setIsCheckoutModalOpen(false);
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
            onClick={handleOpenCheckout}
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
              className="flex w-full items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-6 py-3.5 text-xs font-bold uppercase tracking-widest transition-colors shadow-xs"
            >
              <WhatsAppIcon className="size-4" />
              <span>Enquire on WhatsApp</span>
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
              <p className="text-xs text-muted-foreground mt-0.5">
                {checkoutStep === 1
                  ? 'Step 1 of 2 · Enter your delivery details.'
                  : 'Step 2 of 2 · Choose payment method & confirm order.'}
              </p>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-between border-y border-foreground/15 py-3">
              <button
                type="button"
                onClick={() => setCheckoutStep(1)}
                className="flex items-center gap-2 group cursor-pointer text-left"
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    checkoutStep === 1
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/20 text-primary',
                  )}
                >
                  {checkoutStep > 1 ? <Check className="size-3.5" /> : '1'}
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wider transition-colors',
                    checkoutStep === 1 ? 'text-cocoa' : 'text-muted-foreground group-hover:text-cocoa',
                  )}
                >
                  Delivery Details
                </span>
              </button>

              <div className="h-px flex-1 mx-3 bg-foreground/20" />

              <div className="flex items-center gap-2 text-left">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    checkoutStep === 2
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground/10 text-muted-foreground',
                  )}
                >
                  2
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    checkoutStep === 2 ? 'text-cocoa' : 'text-muted-foreground',
                  )}
                >
                  Payment &amp; Review
                </span>
              </div>
            </div>

            {orderError && (
              <div className="p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20">
                {orderError}
              </div>
            )}

            {checkoutStep === 1 && (
              <form onSubmit={handleContinueToPayment} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold uppercase tracking-wider text-cocoa">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
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
                    onChange={(e) => setFormData((prev) => ({ ...prev, addressLine: e.target.value }))}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, postalCode: e.target.value }))}
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
                    rows={2}
                    value={customerNote}
                    onChange={(event) => setCustomerNote(event.target.value)}
                    placeholder="Anything we should know about your order?"
                    className="w-full border border-foreground/25 p-2 bg-transparent text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutModalOpen(false)}
                    className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep cursor-pointer"
                  >
                    <span>Continue to Payment</span>
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </form>
            )}

            {checkoutStep === 2 && (
              <form onSubmit={handleDirectOrderSubmit} className="space-y-5 text-xs">
                {/* Shipping address review snippet */}
                <div className="bg-secondary/40 border border-foreground/10 p-3.5 flex justify-between items-start rounded-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-cocoa">
                      {formData.name} · <span className="font-normal text-muted-foreground">{formData.phone}</span>
                    </p>
                    <p className="text-foreground/80">
                      {formData.addressLine}, {formData.city}, {formData.state} - {formData.postalCode}
                    </p>
                    <p className="text-muted-foreground text-[0.72rem]">{formData.email}</p>
                    {customerNote && (
                      <p className="text-[0.72rem] italic text-muted-foreground mt-1">Note: &ldquo;{customerNote}&rdquo;</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(1)}
                    className="text-primary hover:underline text-[0.72rem] font-semibold uppercase tracking-wider shrink-0 ml-3 cursor-pointer"
                  >
                    Edit
                  </button>
                </div>

                {/* Payment Option Selection */}
                <div className="space-y-2.5">
                  <label className="font-semibold uppercase tracking-wider text-cocoa text-xs">
                    Payment Method
                  </label>
                  <div className="rounded border border-primary/40 bg-primary/8 p-3.5 shadow-xs ring-1 ring-primary/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="size-3.5 rounded-full border border-primary bg-primary flex items-center justify-center">
                          <span className="size-1.5 rounded-full bg-white" />
                        </span>
                        <span className="text-xs font-bold text-cocoa">Pay Online</span>
                      </div>
                      <span className="text-[0.68rem] font-semibold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded">
                        Fast &amp; Secure
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                      <ShieldCheck className="size-4 shrink-0" />
                      <span>Razorpay Payment Gateway · Zero Fee</span>
                    </div>
                    <p className="text-[0.72rem] text-muted-foreground leading-snug">
                      Instant and encrypted checkout via UPI (Google Pay, PhonePe, Paytm, BHIM), Debit/Credit Cards (Visa, Mastercard, RuPay), and NetBanking.
                    </p>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="border-t border-foreground/15 pt-3 space-y-1.5 text-xs text-cocoa">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items Subtotal ({totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'})</span>
                    <span className="tabular-nums">{formatPrice(totals.subtotal)}</span>
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-terracotta">
                      <span>Promo Discount ({cart.promoCode})</span>
                      <span className="tabular-nums">-{formatPrice(totals.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery</span>
                    <span className="text-forest font-medium">Complimentary</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-2 border-t border-foreground/10">
                    <span>Total Amount Due</span>
                    <span className="text-primary tabular-nums">{formatPrice(totals.estimatedTotal)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(1)}
                    className="border border-foreground/25 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-cocoa hover:border-foreground/50 cursor-pointer"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingOrder}
                    className="flex-1 bg-primary py-3 text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingOrder
                      ? 'Processing Order...'
                      : `Pay Online with Razorpay · ${formatPrice(totals.estimatedTotal)}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
