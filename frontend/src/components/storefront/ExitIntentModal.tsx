import { Check, Copy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/context/StoreContext';
import { SpiralBinding } from '@/components/ui/SpiralBinding';
import { useStorefrontSettings } from '@/services/storefrontSettingsService';
import { readStorage, writeStorage } from '@/services/storage';

/**
 * Exit-intent overlay styled after CircleUp's Forest-Green & Warm Cream store
 * signage. Mounted once at the router root and triggered only when the pointer
 * leaves through the top edge, so it does not interrupt ordinary browsing.
 */
export function ExitIntentModal() {
  const { totals, isSearchOpen, applyPromoCode, showNotice } = useStore();
  const { exitOffer } = useStorefrontSettings();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const hasTriggeredRef = useRef(false);
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isSearchOpen || !exitOffer || !exitOffer.targetPages.some((page) => {
      const target = page.trim().replace(/^\//, '');
      return target === 'all' || target === pathname.slice(1) || (target === 'home' && pathname === '/');
    })) return;
    const cooldownKey = `circleup_exit_offer_${exitOffer.code}`;

    const triggerOnce = () => {
      if (hasTriggeredRef.current) return;
      if (Date.now() - readStorage(cooldownKey, 0) < exitOffer.cooldownHours * 3_600_000) return;
      hasTriggeredRef.current = true;
      writeStorage(cooldownKey, Date.now());
      setOpen(true);
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) triggerOnce();
    };

    document.addEventListener('mouseout', handleMouseOut);
    return () => {
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [exitOffer, isSearchOpen, pathname]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.exit-offer-dialog button:not([disabled])'));
        const first = controls[0]; const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [open]);

  if (!open || !exitOffer || typeof document === 'undefined') return null;

  const hasItems = totals.itemCount > 0;
  const { code, badgeText } = exitOffer;

  const copyCode = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch { showNotice(`Your code is ${code}.`); }
  };

  const handleClaim = () => {
    if (code) applyPromoCode(code);
    setOpen(false);
    if (hasItems) {
      navigate('/cart');
    } else {
      navigate('/new-arrivals');
    }
  };

  return createPortal(
    <div
      className="exit-offer-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-offer-title"
        className="exit-offer-dialog relative my-auto w-full max-w-[42rem] overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <SpiralBinding />
        <div className="exit-offer-content">
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close exit offer"
            className="exit-offer-close"
          >
            <X className="size-5" />
          </button>

          <p className="exit-offer-kicker">A little something for your next find</p>

          <h2 id="exit-offer-title" className="exit-offer-title">
            {exitOffer.headline}
          </h2>

          <p className="exit-offer-copy">
            {exitOffer.subtext}
          </p>

          {code && <div className="exit-offer-coupon">
            <p className="exit-offer-code-label">{badgeText}</p>
            <div className="exit-offer-code-row">
              <p className="exit-offer-code">{code}</p>
              <button type="button" onClick={copyCode} className="exit-offer-copy-button">
                <span>{copied ? 'Copied' : 'Copy code'}</span>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            </div>
          </div>}

          <div className="exit-offer-actions">
            <button type="button" onClick={handleClaim} className="exit-offer-claim">
              {hasItems ? (code ? `Use ${code} & view bag` : 'View bag') : (code ? `Use ${code} & browse finds` : 'Browse finds')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="exit-offer-dismiss">
              No thanks
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
