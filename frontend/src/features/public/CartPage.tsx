import { Copy, ExternalLink, Minus, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { useStore } from '@/context/StoreContext';
import {
  cartService,
  formatInr,
  WHATSAPP_BUSINESS_NUMBER,
} from '@/services/cartService';

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
  const [whatsappOpened, setWhatsappOpened] = useState(false);

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
            className="text-destructive underline underline-offset-4 hover:opacity-80"
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
              <Link to={`/product/${item.slug}`} className="w-24 sm:w-28 shrink-0 bg-[#ece6d2]">
                <img
                  src={item.image}
                  alt={item.name}
                  className="aspect-[4/5] w-full object-cover object-top"
                />
              </Link>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    to={`/product/${item.slug}`}
                    className="font-medium text-cocoa hover:text-primary"
                  >
                    {item.name}
                  </Link>
                  <span className="font-bold text-primary tabular-nums shrink-0">
                    {formatInr(item.unitPrice * item.quantity)}
                  </span>
                </div>

                <p className="text-xs text-terracotta">
                  {item.variantLabel} · Unit price: {formatInr(item.unitPrice)}
                </p>

                <div className="pt-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="inline-flex items-center border border-foreground/30">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.name}`}
                      onClick={() => updateCartQuantity(item.key, item.quantity - 1)}
                      className="p-1.5 text-cocoa hover:text-primary"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="px-3 text-xs font-medium tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.name}`}
                      disabled={item.quantity >= item.maxStock}
                      onClick={() => updateCartQuantity(item.key, item.quantity + 1)}
                      className="p-1.5 text-cocoa disabled:opacity-35 hover:text-primary"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.key)}
                    className="inline-flex items-center gap-1.5 text-xs text-terracotta hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="pt-6">
            <Link
              to="/new-arrivals"
              className="text-xs font-semibold uppercase tracking-wider text-primary underline underline-offset-4"
            >
              ← Continue Shopping
            </Link>
          </div>
        </div>

        {/* Summary & WhatsApp checkout */}
        <aside className="bg-card/85 border border-foreground/15 p-6 sm:p-8 space-y-6">
          <div className="border-b border-foreground/15 pb-4">
            <h2 className="font-display text-2xl text-cocoa">Order Summary</h2>
            <p className="mt-1 text-xs text-terracotta">Cart Reference: {cart.cartId}</p>
          </div>

          {/* Promo code */}
          <form onSubmit={handlePromoSubmit} className="space-y-2">
            <label htmlFor="promo-code" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
              Promo Code (try THRIFT10 or CIRCLE20)
            </label>
            <div className="flex gap-2">
              <input
                id="promo-code"
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Enter code"
                className="flex-1 border-b border-foreground/30 bg-transparent py-1.5 text-sm text-cocoa uppercase focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                className="border border-foreground/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-cocoa hover:border-primary"
              >
                Apply
              </button>
            </div>
            {promoError && <p className="text-xs text-destructive">{promoError}</p>}
          </form>

          {/* Totals */}
          <div className="space-y-2 text-sm border-y border-foreground/15 py-4">
            <div className="flex justify-between">
              <span className="text-terracotta">Subtotal</span>
              <span className="tabular-nums text-cocoa">{formatInr(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Discount ({totals.discountLabel})</span>
                <span className="tabular-nums">-{formatInr(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-foreground/10 font-bold text-base text-cocoa">
              <span>Estimated Total</span>
              <span className="text-primary tabular-nums">{formatInr(totals.estimatedTotal)}</span>
            </div>
          </div>

          {/* Optional note */}
          <div>
            <label htmlFor="checkout-note" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Delivery / Fit Note (Optional)
            </label>
            <input
              id="checkout-note"
              type="text"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="City, preferred delivery window, etc."
              className="w-full border-b border-foreground/30 bg-transparent py-1.5 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          {/* WhatsApp message preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-terracotta">
                WhatsApp Message Preview
              </span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Copy className="size-3.5" />
                <span>Copy</span>
              </button>
            </div>
            <pre className="whitespace-pre-wrap bg-secondary/80 p-3 text-[0.72rem] leading-relaxed text-cocoa font-mono max-h-48 overflow-y-auto border border-foreground/10">
              {whatsapp.message}
            </pre>
          </div>

          <a
            href={whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setWhatsappOpened(true)}
            className="flex w-full items-center justify-center gap-2 bg-primary px-6 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep"
          >
            <span>Checkout via WhatsApp</span>
            <ExternalLink className="size-4" />
          </a>

          <p className="text-[0.72rem] leading-relaxed text-terracotta">
            Important: Opening WhatsApp ({WHATSAPP_BUSINESS_NUMBER} placeholder) does{' '}
            <strong>not</strong> confirm your order or save it to a backend. You must send the
            prefilled message and await manual confirmation from CircleUp.
          </p>

          {whatsappOpened && (
            <div className="border border-primary/35 bg-accent/60 p-3 text-xs text-cocoa">
              WhatsApp link opened for Cart ID <strong>{cart.cartId}</strong>. Your bag remains
              saved in this browser until you choose to clear it.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

