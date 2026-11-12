import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/context/StoreContext';

/**
 * Exit-intent overlay styled after CircleUp's Forest-Green & Warm Cream store
 * signage. Mounted once at the router root so it triggers immediately when the
 * pointer leaves the viewport and never repeats across client-side navigation.
 */
export function ExitIntentModal() {
  const { totals, isSearchOpen, applyPromoCode, showNotice } = useStore();
  const [open, setOpen] = useState(false);
  const hasTriggeredRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isSearchOpen || typeof document === 'undefined') return;

    const triggerOnce = () => {
      if (hasTriggeredRef.current) return;
      hasTriggeredRef.current = true;
      setOpen(true);
    };

    const handleMouseLeave = () => {
      triggerOnce();
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        triggerOnce();
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseout', handleMouseOut);
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const hasItems = totals.itemCount > 0;
  const code = totals.subtotal >= 1500 ? 'CIRCLE20' : 'THRIFT10';
  const codeDesc =
    code === 'CIRCLE20' ? '20% off orders ₹1,500+' : '10% off your curated find';

  const handleClaim = () => {
    applyPromoCode(code);
    setOpen(false);
    if (hasItems) {
      navigate('/cart');
    } else {
      showNotice(`Code ${code} saved to your bag for checkout.`);
      navigate('/new-arrivals');
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Before you leave CircleUp"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#182212]/75 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-lg bg-[#2f3e24] p-3 sm:p-4 shadow-2xl border border-[#f8f4e2]/30 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-2 border-[#f8f4e2]/80 p-1">
          <div className="bg-[#f8f4e2] border border-[#2f3e24]/40 p-6 sm:p-8 text-center space-y-5 relative">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close exit offer"
              className="absolute top-4 right-4 p-1 text-cocoa/70 hover:text-primary"
            >
              <X className="size-5" />
            </button>

            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-terracotta">
              Wait Before You Go
            </p>

            <h2 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight">
              {hasItems
                ? `Your ${totals.itemCount} curated piece${totals.itemCount > 1 ? 's are' : ' is'} still waiting`
                : 'One-of-a-kind finds rarely stay on the rail'}
            </h2>

            <p className="text-sm leading-relaxed text-foreground/80 max-w-md mx-auto">
              {hasItems
                ? 'Most CircleUp pieces are single 1-of-1 thrift finds. Apply our local bag code below before you head to WhatsApp checkout.'
                : 'Most pieces on CircleUp exist in a single size. Take a local bag code with you while exploring today.'}
            </p>

            <div className="border-y border-foreground/15 py-4 space-y-1">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-terracotta">
                Bag Code ({codeDesc})
              </p>
              <p className="font-display text-2xl tracking-wider text-primary">{code}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={handleClaim}
                className="flex-1 bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
              >
                {hasItems ? `Apply ${code} & View Bag` : `Apply ${code} & Browse Finds`}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-foreground/30 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-cocoa hover:border-primary transition-colors"
              >
                No Thanks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
