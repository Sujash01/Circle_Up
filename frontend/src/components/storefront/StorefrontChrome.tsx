import { ChevronDown, Heart, Menu, Search, ShoppingBag, Sparkles, User, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { store } from '@/app/store';
import { authService } from '@/services/authService';
import { storefrontApi } from '@/services/storefrontApi';
import bag1 from '@/assets/bag-1.jpg';
import circleUpLogo from '@/assets/circle-up-logo.png';
import crumpledPaper from '@/assets/crumpled-paper.webp';
import rtw1 from '@/assets/rtw-1.jpg';
import { useStore } from '@/context/StoreContext';
import { SpiralBinding } from '@/components/ui/SpiralBinding';
import { WaveDivider } from '@/components/ui/WaveDivider';
import { cn } from '@/lib/utils';
import { subscribeToScrollFrames } from '@/lib/scrollScheduler';
import { formatPrice } from '@/services/cartService';
import { productService } from '@/services/productService';
import { useHeaderPromo } from '@/services/storefrontSettingsService';

const pad = 'px-5 sm:px-10 lg:px-14 xl:px-20 2xl:px-28 max-w-[2000px] mx-auto';

const NAV_GROUPS = [
  {
    heading: 'Clothing',
    items: [
      { label: 'New Arrivals', to: '/new-arrivals' },
      { label: "Women's Upperwear", to: '/womens-upperwear' },
      { label: "Women's Bottomwear", to: '/womens-bottomwear' },
      { label: "Women's One Piece", to: '/womens-one-piece' },
      { label: "Men's Upperwear (Unisex)", to: '/mens-upperwear' },
      { label: "Men's Bottomwear (Unisex)", to: '/mens-bottomwear' },
      { label: 'Ethnic Wear', to: '/ethnic-wear' },
    ],
  },
  {
    heading: 'Other Items',
    items: [
      { label: 'Jewellery', to: '/jewellery' },
      { label: 'Accessories', to: '/accessories' },
      { label: 'Footwear', to: '/footwear' },
      { label: 'Handcrafted', to: '/handcrafted' },
      { label: 'Rentals', to: '/rentals' },
    ],
  },
  {
    heading: 'CircleUp World',
    items: [
      { label: 'About Us', to: '/about' },
      { label: 'Events — Social Circle', to: '/events' },
      { label: '#ThriftCrew', to: '/thriftcrew' },
      { label: 'Reviews', to: '/reviews' },
      { label: 'Contact', to: '/contact' },
    ],
  },
];

export function StorefrontTopBanner({ text }: { text?: string }) {
  const promo = useHeaderPromo();
  if (!promo.isActive && !text) return null;

  return (
    <div className="storefront-top-banner" role="note" aria-label="Store announcement">
      {text ? (
        <span>{text}</span>
      ) : promo.text ? (
        <span>{promo.text}</span>
      ) : (
        <>
          <span>
            Use code <strong>THRIFT10</strong> or <strong>CIRCLE20</strong> in bag
          </span>
          <i aria-hidden="true">•</i>
          <span>Plastic-free packaging, always</span>
        </>
      )}
    </div>
  );
}

function SearchOverlay() {
  const { isSearchOpen, closeSearch } = useStore();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen, closeSearch]);

  if (!isSearchOpen || typeof document === 'undefined') return null;

  const liveMatches = query.trim()
    ? productService.queryProducts({ search: query }).slice(0, 6)
    : productService.queryProducts({ newArrivalsOnly: true }).slice(0, 4);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    closeSearch();
    navigate(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search');
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search CircleUp catalog"
      className="fixed inset-0 z-[60] bg-[#182212]/70 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 px-4"
      onClick={closeSearch}
    >
      <div
        className="organic-panel w-full max-w-2xl border-2 border-primary/30 bg-background p-6 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-foreground/15 pb-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
            Search Archive &amp; Finds
          </span>
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close search"
            className="flex size-[44px] items-center justify-center text-cocoa hover:text-primary"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search corsets, denim, bags, scarves, crochet..."
            className="flex-1 border-b-2 border-foreground/30 bg-transparent py-2.5 text-sm text-cocoa placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-[44px] bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-forest-deep transition-colors"
          >
            Search
          </button>
        </form>

        <div className="mt-6">
          <p className="text-[0.72rem] uppercase tracking-[0.16em] text-terracotta">
            {query.trim() ? `Quick matches (${liveMatches.length})` : 'Freshly added pieces'}
          </p>

          {liveMatches.length === 0 ? (
            <p className="mt-3 text-sm text-foreground/75">
              No pieces matched "{query}". Press Search to view suggestions.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-foreground/10">
              {liveMatches.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/product/${item.slug}`}
                    onClick={closeSearch}
                    className="flex min-h-[44px] items-center justify-between py-2.5 hover:bg-primary/5 px-1 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.images[0]}
                        alt={item.name}
                        width={44}
                        height={44}
                        loading="lazy"
                        decoding="async"
                        className="size-11 object-cover shrink-0 border border-foreground/10"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-cocoa truncate">{item.name}</p>
                        <p className="text-xs text-terracotta">
                          {item.categoryLabel} • {item.subcategory}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-primary shrink-0 ml-4 tabular-nums">
                      {formatPrice(item.price)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NoticeBanner() {
  const { notice, dismissNotice } = useStore();
  if (!notice || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-5 right-5 z-[60] flex items-center gap-4 px-5 py-3 text-xs font-medium shadow-xl border',
        notice.tone === 'error'
          ? 'bg-destructive text-destructive-foreground border-destructive'
          : 'bg-footer text-footer-foreground border-[#f8f4e2]/25',
      )}
    >
      <span>{notice.text}</span>
      <button
        type="button"
        onClick={dismissNotice}
        aria-label="Dismiss notice"
        className="flex size-[44px] items-center justify-center opacity-75 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>,
    document.body,
  );
}

/** Desktop nav link that highlights itself (and sets aria-current) on its own route. */
function NavPill({ to, children }: { to: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const active = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'nav-pill-link relative inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold transition-colors hover:text-primary',
        active ? 'text-primary' : 'text-cocoa/90',
      )}
    >
      <span className="nav-pill-surface" aria-hidden="true" />
      <span className="relative">{children}</span>
    </Link>
  );
}

/**
 * Shared header keeping the visual design of the homepage header while offering
 * expandable category navigation for desktop and mobile.
 */
export function StorefrontHeader({ preserveHomeHeader = false }: { preserveHomeHeader?: boolean }) {
  const { totals, wishlistIds, openSearch } = useStore();
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return store.getState().auth.user || authService.getStoredSession()?.user || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const stateUser = store.getState().auth.user;
        setCurrentUser(stateUser || authService.getStoredSession()?.user || null);
      } catch {
        setCurrentUser(null);
      }
    };
    sync();
    return store.subscribe(sync);
  }, []);

  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customDrop, setCustomDrop] = useState<{
    label: string;
    to: string;
    badge?: string;
    description?: string;
    enabled: boolean;
  }>({
    label: 'Winter Archival Drop',
    to: '/thrifted-treasure',
    badge: 'Featured Drop',
    description: 'Curated one-of-one archive pieces',
    enabled: true,
  });

  useEffect(() => {
    const ac = new AbortController();
    storefrontApi
      .getHomepage(ac.signal)
      .then((data) => {
        if (data?.customDrop) {
          setCustomDrop(data.customDrop);
        }
      })
      .catch(() => { });
    return () => ac.abort();
  }, []);

  const headerRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    return subscribeToScrollFrames((scrollY) => {
      header.classList.toggle('is-scrolled', scrollY > 24);
    });
  }, []);

  useEffect(() => {
    if (location.hash === '#collections') {
      setShopMenuOpen(true);
    } else {
      setShopMenuOpen(false);
    }
    setMobileMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!shopMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShopMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShopMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [shopMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const menu = mobileMenuRef.current;
    if (!menu) return;

    const getFocusable = () =>
      Array.from(
        menu.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    getFocusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileMenuTriggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!menu.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header
      ref={headerRef}
      className="storefront-header sticky top-0 z-40 border-b border-foreground/20 bg-[#f8f4e2]/95 backdrop-blur-md shadow-xs"
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={cn('storefront-header-inner flex items-center justify-between py-3 sm:py-3', pad)}>
        <div className="storefront-brand-cluster flex items-center gap-3">
          <button
            type="button"
            ref={mobileMenuTriggerRef}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-directory"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="xl:hidden flex size-[44px] items-center justify-center rounded-full text-cocoa hover:text-primary"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <Link
            to="/"
            aria-label="CircleUp home"
            className="storefront-brand flex items-center transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 rounded"
          >
            <img
              src={circleUpLogo}
              alt="CircleUp"
              className="h-10 sm:h-11 md:h-12 w-auto object-contain select-none"
              width={140}
              height={48}
            />
          </Link>
        </div>

        <div className="storefront-header-actions">
          <nav
            className="storefront-primary-nav hidden items-center gap-1 xl:flex lg:gap-2"
            aria-label="Storefront"
          >
            <NavPill to="/">Home</NavPill>

            <button
              type="button"
              aria-expanded={shopMenuOpen}
              onClick={() => setShopMenuOpen((prev) => !prev)}
              className={cn(
                'nav-pill-link relative inline-flex min-h-[44px] items-center gap-1 rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold transition-colors hover:text-primary',
                shopMenuOpen ? 'text-primary' : 'text-cocoa/90',
              )}
            >
              <span className={cn('nav-pill-surface', shopMenuOpen && 'is-active')} aria-hidden="true" />
              <span className="relative">Collections</span>
              <ChevronDown
                className={cn('size-4 transition-transform', shopMenuOpen && 'rotate-180')}
              />
            </button>

            <NavPill to="/events">{preserveHomeHeader ? 'Store & Events' : 'Events'}</NavPill>
          </nav>

          <div className="storefront-header-tools">
            <button
              type="button"
              aria-label="Search"
              onClick={openSearch}
              className="storefront-search-button hidden min-h-[44px] items-center gap-2.5 rounded-full border-2 border-foreground/30 bg-card/90 px-4 py-2 text-xs lg:text-sm font-semibold text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm sm:flex"
            >
              <Search className="size-5" strokeWidth={2} />
              <span>Search pre-loved &amp; archive finds...</span>
            </button>

            <button
              type="button"
              aria-label="Search"
              onClick={openSearch}
              className="flex sm:hidden size-[44px] items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa"
            >
              <Search className="size-4" />
            </button>

            {currentUser ? (
              <Link
                to={currentUser.actorType === 'ADMIN' || currentUser.role === 'OWNER' || currentUser.role === 'STAFF' ? '/admin' : '/account'}
                aria-label={`Profile (${currentUser.fullName})`}
                className="storefront-account-link flex min-h-[38px] items-center gap-1.5 rounded-full border-2 border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary shadow-xs transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-sm shrink-0"
              >
                <User className="size-4" />
                <span>Profile</span>
              </Link>
            ) : (
              <Link
                to="/signup"
                className="storefront-signup-cta inline-flex min-h-[38px] items-center rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-xs shrink-0"
              >
                Sign Up
              </Link>
            )}

            <Link
              to="/wishlist"
              aria-label={`Wishlist (${wishlistIds.length} saved)`}
              className="relative flex size-[44px] items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm"
            >
              <Heart className="size-5" strokeWidth={2} />
              {wishlistIds.length > 0 && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-steel text-[0.62rem] font-bold text-primary-foreground shadow-xs">
                  {wishlistIds.length}
                </span>
              )}
            </Link>

            <Link
              to="/cart"
              aria-label={`Shopping bag (${totals.itemCount} items)`}
              className="relative flex size-[44px] items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm"
            >
              <ShoppingBag className="size-5" strokeWidth={2} />
              {totals.itemCount > 0 && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.62rem] font-bold text-primary-foreground shadow-xs">
                  {totals.itemCount}
                </span>
              )}
            </Link>

            <Link to="/new-arrivals" className="storefront-browse-cta">
              Browse finds
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Half-page width, content-fit height desktop Collections drop */}
      {shopMenuOpen && (
        <div
          role="dialog"
          aria-label="CircleUp Collections Directory"
          className="organic-panel hidden md:block absolute left-1/2 top-full -translate-x-1/2 w-[54vw] min-w-[560px] max-w-[820px] border-x-2 border-b-2 border-foreground/20 bg-background z-40 shadow-2xl"
        >
          <div className="px-7 py-6 space-y-4">
            {/* Small Dedicated Section for Brand New Items */}
            <div className="rounded-xl border border-primary/25 bg-primary/6 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-cocoa">
                  Brand New Items
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  · Unworn with tags, mint studio crafts &amp; pristine fresh arrivals
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Link
                  to="/brand-new"
                  onClick={() => setShopMenuOpen(false)}
                  className="font-bold text-primary hover:underline flex items-center gap-1 shrink-0"
                >
                  <span>All Brand New</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <span className="text-foreground/20" aria-hidden="true">|</span>
                <Link
                  to="/new-arrivals"
                  onClick={() => setShopMenuOpen(false)}
                  className="font-medium text-cocoa hover:text-primary"
                >
                  Fresh Finds
                </Link>
              </div>
            </div>

            {/* Curated Drop Banner - Standalone, directly below Brand New Items */}
            {customDrop?.enabled && (
              <Link
                to={customDrop.to}
                onClick={() => setShopMenuOpen(false)}
                className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 flex items-center justify-between text-xs font-bold text-primary hover:bg-primary/15 transition-all shadow-2xs group"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-primary shrink-0" />
                  <span className="font-bold text-cocoa">{customDrop.label}</span>
                  {customDrop.description && (
                    <span className="text-[0.72rem] font-normal text-muted-foreground hidden sm:inline">
                      · {customDrop.description}
                    </span>
                  )}
                </div>
                <span className="text-[0.62rem] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2.5 py-0.5 rounded-full shrink-0 group-hover:translate-x-0.5 transition-transform">
                  {customDrop.badge || 'Curated Drop'} →
                </span>
              </Link>
            )}

            {/* 3-Column Directory (Clothing, Other Items, CircleUp World) */}
            <div className="grid grid-cols-3 gap-7 items-start">
              {NAV_GROUPS.map((group) => {
                return (
                  <div key={group.heading} className="space-y-3">
                    <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta border-b border-foreground/15 pb-1.5">
                      {group.heading}
                    </h2>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            onClick={() => setShopMenuOpen(false)}
                            className="flex min-h-[44px] items-center text-[0.84rem] font-medium text-cocoa/90 hover:text-primary hover:translate-x-0.5 transition-all"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-foreground/15 pt-4 text-xs">
              <div className="flex items-center gap-5">
                <Link
                  to="/brand-new"
                  onClick={() => setShopMenuOpen(false)}
                  className="inline-flex items-center gap-2.5 group"
                >
                  <img
                    src={rtw1}
                    alt="Brand New"
                    width={36}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    className="size-9 object-cover object-top border border-foreground/15"
                  />
                  <span className="font-semibold text-cocoa group-hover:text-primary">
                    Brand New →
                  </span>
                </Link>
                <Link
                  to="/thrifted"
                  onClick={() => setShopMenuOpen(false)}
                  className="inline-flex items-center gap-2.5 group"
                >
                  <img
                    src={bag1}
                    alt="Curated Thrifted Rail"
                    width={36}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    className="size-9 object-cover border border-foreground/15"
                  />
                  <span className="font-semibold text-cocoa group-hover:text-primary">
                    Thrifted Rail →
                  </span>
                </Link>
              </div>

              <div className="flex items-center gap-3.5 font-semibold uppercase tracking-wider text-xs">
                {currentUser ? (
                  <Link
                    to="/account"
                    onClick={() => setShopMenuOpen(false)}
                    className="text-cocoa hover:text-primary transition-colors no-underline"
                  >
                    Profile ({(currentUser.fullName || 'User').split(' ')[0]})
                  </Link>
                ) : (
                  <Link
                    to="/signup"
                    onClick={() => setShopMenuOpen(false)}
                    className="text-cocoa hover:text-primary transition-colors no-underline"
                  >
                    Sign Up
                  </Link>
                )}
                <span className="text-foreground/20" aria-hidden="true">|</span>
                <Link
                  to="/cart"
                  onClick={() => setShopMenuOpen(false)}
                  className="text-cocoa hover:text-primary transition-colors no-underline border-0 border-transparent !border-0 outline-none"
                >
                  Bag ({totals.itemCount})
                </Link>
                <Link
                  to="/wishlist"
                  onClick={() => setShopMenuOpen(false)}
                  className="text-cocoa hover:text-primary transition-colors no-underline border-0 border-transparent !border-0 outline-none"
                >
                  Wishlist ({wishlistIds.length})
                </Link>
                <button
                  type="button"
                  onClick={() => setShopMenuOpen(false)}
                  aria-label="Close collections menu"
                  className="flex size-[44px] items-center justify-center text-terracotta hover:text-primary"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        ref={mobileMenuRef}
        id="mobile-directory"
        aria-label="Mobile storefront"
        aria-hidden={!mobileMenuOpen}
        className={cn('mobile-directory xl:hidden', mobileMenuOpen && 'is-open')}
      >
        {/* Mobile Small Section for Brand New */}
        <div className="rounded-xl border border-primary/25 bg-primary/8 p-3 flex items-center justify-between gap-2 shadow-2xs mb-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-cocoa">
              Brand New Items
            </span>
          </div>
          <Link
            to="/brand-new"
            onClick={() => setMobileMenuOpen(false)}
            className="text-xs font-bold text-primary hover:underline"
          >
            All Brand New →
          </Link>
        </div>

        {/* Mobile Curated Drop - Standalone, directly below Brand New Items */}
        {customDrop?.enabled && (
          <Link
            to={customDrop.to}
            onClick={() => setMobileMenuOpen(false)}
            className="flex min-h-[44px] items-center justify-between text-sm font-bold text-cocoa bg-primary/10 px-3 py-2 rounded-xl border border-primary/25 mb-3 group"
          >
            <span className="flex items-center gap-2 truncate">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span className="truncate text-cocoa">{customDrop.label}</span>
            </span>
            <span className="text-[0.62rem] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full shrink-0">
              {customDrop.badge || 'Drop'} →
            </span>
          </Link>
        )}

        {NAV_GROUPS.map((group) => {
          return (
            <div key={group.heading}>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2">
                {group.heading}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex min-h-[48px] items-center text-sm font-medium text-cocoa hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        <div className="border-t border-foreground/15 pt-4 mt-2">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2">
            Account & Access
          </p>
          <div>
            {currentUser ? (
              <Link
                to="/account"
                className="flex min-h-[44px] items-center text-sm font-semibold text-primary hover:text-primary/80"
              >
                My Profile & Orders ({(currentUser.fullName || 'User').split(' ')[0]}) →
              </Link>
            ) : (
              <Link
                to="/signup"
                className="flex min-h-[44px] items-center text-sm font-semibold text-primary hover:text-primary/80"
              >
                Create Account (Sign Up) →
              </Link>
            )}
          </div>
        </div>
      </nav>

      <SearchOverlay />
      <NoticeBanner />
    </header>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) {
  return (
    <div>
      <h3 className="font-body text-[0.76rem] font-bold tracking-[0.2em] text-sage-glow uppercase">
        {title}
      </h3>
      <ul className="mt-4 space-y-1">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="flex min-h-[44px] items-center text-[0.9rem] text-footer-foreground/75 transition-all duration-300 hover:translate-x-1 hover:text-footer-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StorefrontFooter() {
  return (
    <>
      <WaveDivider className="text-footer" />
      <footer className="bg-footer text-footer-foreground border-t-2 border-[#f7f3e1]/20">
        <div
          className={cn(
            'grid gap-10 py-12 sm:grid-cols-3 lg:grid-cols-[1.5fr_repeat(3,minmax(0,0.8fr))] lg:gap-8 lg:py-14',
            pad,
          )}
        >
          <div className="sm:col-span-3 lg:col-span-1">
            <Link to="/" aria-label="CircleUp home" className="inline-block transition-transform hover:scale-[1.02]">
              <img
                src={circleUpLogo}
                alt="CircleUp"
                className="h-10 sm:h-12 w-auto object-contain brightness-0 invert opacity-90 mb-3"
              />
            </Link>
            <p className="mt-1 font-display text-[1.5rem] leading-[1.15]">
              Fashion
              <br />
              That Lasts!
            </p>
            <p className="mt-5 max-w-xs text-[0.9rem] leading-relaxed text-footer-foreground/70">
              Curated pre-loved and thrift finds, rentals and handcrafted pieces, given a second life.
            </p>
          </div>
          <FooterCol
            title="Shop"
            links={[
              { label: 'New Arrivals', to: '/new-arrivals' },
              { label: "Women's Upperwear", to: '/womens-upperwear' },
              { label: "Men's Upperwear", to: '/mens-upperwear' },
              { label: 'Rentals', to: '/rentals' },
              { label: 'Handcrafted', to: '/handcrafted' },
            ]}
          />
          <FooterCol
            title="Community"
            links={[
              { label: 'The Social Circle Events', to: '/events' },
              { label: '#ThriftCrew Gallery', to: '/thriftcrew' },
              { label: 'Customer Reviews', to: '/reviews' },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { label: 'About Us', to: '/about' },
              { label: 'Saved Wishlist', to: '/wishlist' },
              { label: 'Shopping Bag', to: '/cart' },
              { label: 'Contact', to: '/contact' },
              { label: 'Customer Portal', to: '/account' },
              { label: 'Admin Workspace', to: '/admin' },
            ]}
          />
        </div>
        <div className="border-t border-[#f7f3e1]/12">
          <div
            className={cn(
              'flex flex-col items-center justify-between gap-3 py-6 text-[0.8rem] text-footer-foreground/65 sm:flex-row',
              pad,
            )}
          >
            <p>© {new Date().getFullYear()} CircleUp. Fashion that lasts.</p>
            <button
              type="button"
              onClick={() =>
                window.scrollTo({
                  top: 0,
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
                })
              }
              className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-footer-foreground/85 transition-colors hover:text-footer-foreground"
            >
              Back to top
              <span aria-hidden>↑</span>
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}

export function StorefrontPaperWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full bg-[#f8f4e2] overflow-x-clip">
      <div className="relative w-full">

        <div className="paper-sheet-3d paper-fullscreen relative w-full min-h-screen overflow-clip text-foreground bg-[#f8f4e2]">
          <div
            aria-hidden
            className="paper-slight-crinkle"
            style={{ backgroundImage: `url(${crumpledPaper})` }}
          />
          <div aria-hidden className="paper-ambient-sheen" />

          <div className="relative z-20">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Outer layout shell for all inner storefront pages (keeps HomePage untouched).
 */
export function StorefrontLayout() {
  return (
    <StorefrontPaperWrapper>
      <StorefrontTopBanner />
      <StorefrontHeader />
      <div className="storefront-notebook-sheet">
        <SpiralBinding />
        <main id="main" className="storefront-notebook-content">
          <Outlet />
        </main>
      </div>
      <StorefrontFooter />
    </StorefrontPaperWrapper>
  );
}

/**
 * Clean layout for auth and standalone pages (without notebook spiral binding).
 */
export function StorefrontCleanLayout() {
  return (
    <StorefrontPaperWrapper>
      <StorefrontTopBanner />
      <StorefrontHeader />
      <main id="main" className="min-h-[calc(100vh-220px)] flex items-center justify-center py-8 px-4 sm:px-6">
        <Outlet />
      </main>
      <StorefrontFooter />
    </StorefrontPaperWrapper>
  );
}

