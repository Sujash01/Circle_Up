import { ChevronDown, Heart, Menu, Search, ShoppingBag, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import bag1 from '@/assets/bag-1.jpg';
import crumpledPaper from '@/assets/crumpled-paper.jpg';
import rtw1 from '@/assets/rtw-1.jpg';
import { useStore } from '@/context/StoreContext';
import { SpiralBinding } from '@/components/ui/SpiralBinding';
import { WaveDivider } from '@/components/ui/WaveDivider';
import { cn } from '@/lib/utils';
import { subscribeToScrollFrames } from '@/lib/scrollScheduler';
import { formatPrice } from '@/services/cartService';
import { productService } from '@/services/productService';

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
    heading: 'Objects & Craft',
    items: [
      { label: 'Footwear', to: '/footwear' },
      { label: 'Rentals', to: '/rentals' },
      { label: 'Thrifted Treasure', to: '/thrifted-treasure' },
      { label: 'Jewellery', to: '/jewellery' },
      { label: 'Accessories', to: '/accessories' },
      { label: 'Handcrafted', to: '/handcrafted' },
    ],
  },
  {
    heading: 'CircleUp World',
    items: [
      { label: 'About Us', to: '/about' },
      { label: 'Reviews', to: '/reviews' },
      { label: 'Events — Social Circle', to: '/events' },
      { label: '#ThriftCrew', to: '/thriftcrew' },
      { label: 'Contact', to: '/contact' },
    ],
  },
];

export function StorefrontTopBanner() {
  return (
    <div className="storefront-top-banner" role="note" aria-label="Store announcement">
      <span>
        Use code <strong>THRIFT10</strong> or <strong>CIRCLE20</strong> in bag
      </span>
      <i aria-hidden="true">•</i>
      <span>Plastic-free packaging, always</span>
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
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    setShopMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

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
            className="storefront-brand text-cocoa transition-colors hover:text-primary"
          >
            <span className="storefront-wordmark">CircleUp</span>
            <span className="storefront-brand-caption" aria-hidden="true">
              Thrift · rental · rewear
            </span>
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
              <span>Search vintage finds...</span>
            </button>

            <button
              type="button"
              aria-label="Search"
              onClick={openSearch}
              className="flex sm:hidden size-[44px] items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa"
            >
              <Search className="size-4" />
            </button>

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
          <div className="px-7 py-6 space-y-5">
            <div className="grid grid-cols-3 gap-7 items-start">
              {NAV_GROUPS.map((group) => (
                <div key={group.heading} className="space-y-3">
                  <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta border-b border-foreground/15 pb-1.5">
                    {group.heading}
                  </h2>
                  <ul className="space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          className="flex min-h-[44px] items-center text-[0.84rem] font-medium text-cocoa/90 hover:text-primary hover:translate-x-0.5 transition-all"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-foreground/15 pt-4 text-xs">
              <div className="flex items-center gap-5">
                <Link to="/new-arrivals" className="inline-flex items-center gap-2.5 group">
                  <img
                    src={rtw1}
                    alt="New Arrivals Co-Ord"
                    width={36}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    className="size-9 object-cover object-top border border-foreground/15"
                  />
                  <span className="font-semibold text-cocoa group-hover:text-primary">
                    Fresh Finds →
                  </span>
                </Link>
                <Link to="/rentals" className="inline-flex items-center gap-2.5 group">
                  <img
                    src={bag1}
                    alt="Rental & Vintage Bags"
                    width={36}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    className="size-9 object-cover border border-foreground/15"
                  />
                  <span className="font-semibold text-cocoa group-hover:text-primary">
                    Rental Rail →
                  </span>
                </Link>
              </div>

              <div className="flex items-center gap-4 font-semibold uppercase tracking-wider">
                <Link to="/cart" className="text-primary underline underline-offset-4">
                  Bag ({totals.itemCount})
                </Link>
                <Link to="/wishlist" className="text-cocoa hover:text-primary underline underline-offset-4">
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
        {NAV_GROUPS.map((group) => (
          <div key={group.heading}>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2">
              {group.heading}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex min-h-[48px] items-center text-sm font-medium text-cocoa hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
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
            <p className="font-body text-[clamp(2.2rem,4vw,3.2rem)] leading-none font-extrabold tracking-tight text-[#d8e1c4]">
              CircleUp
            </p>
            <p className="mt-4 font-display text-[1.5rem] leading-[1.15]">
              Fashion
              <br />
              That Lasts!
            </p>
            <p className="mt-5 max-w-xs text-[0.9rem] leading-relaxed text-footer-foreground/70">
              Curated vintage and thrift finds, rentals and handcrafted pieces, given a second life.
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
              { label: 'Thrifted Treasure', to: '/thrifted-treasure' },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { label: 'About Us', to: '/about' },
              { label: 'Contact', to: '/contact' },
              { label: 'Shopping Bag', to: '/cart' },
              { label: 'Saved Wishlist', to: '/wishlist' },
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

