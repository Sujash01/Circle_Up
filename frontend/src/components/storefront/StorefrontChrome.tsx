import { ChevronDown, Heart, Menu, Search, ShoppingBag, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import bag1 from '@/assets/bag-1.jpg';
import crumpledPaper from '@/assets/crumpled-paper.jpg';
import rtw1 from '@/assets/rtw-1.jpg';
import { useStore } from '@/context/StoreContext';
import { cn } from '@/lib/utils';
import { formatInr } from '@/services/cartService';
import { productService } from '@/services/productService';

const pad = 'px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1560px] mx-auto';

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
    <div className="bg-footer px-4 py-2.5 text-center text-[0.72rem] font-medium tracking-wide text-footer-foreground border-b border-[#f7f3e1]/15">
      Use code THRIFT10 or CIRCLE20 in bag • Plastic-free sustainable packaging on every parcel
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
        className="w-full max-w-2xl bg-[#f8f4e2] border-2 border-primary/30 p-6 sm:p-8 shadow-2xl"
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
            className="p-1 text-cocoa hover:text-primary"
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
            className="bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-forest-deep transition-colors"
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
                    className="flex items-center justify-between py-2.5 hover:bg-primary/5 px-1 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.images[0]}
                        alt={item.name}
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
                      {formatInr(item.price)}
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
        className="opacity-75 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>,
    document.body,
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
  const location = useLocation();

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

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b-2 border-foreground/15 bg-[#f8f4e2]/95 backdrop-blur-md shadow-xs transition-all"
    >
      <div className={cn('flex items-center justify-between py-4 sm:py-5', pad)}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-1.5 text-cocoa hover:text-primary"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <Link
            to="/"
            className="font-body text-2xl sm:text-[1.85rem] font-black tracking-tight text-cocoa transition-colors hover:text-primary flex items-center gap-2"
          >
            <span>CircleUp</span>
            <span className="inline-block size-2.5 rounded-full bg-primary" />
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex lg:gap-2" aria-label="Storefront">
          <Link
            to="/"
            className="rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold text-cocoa/90 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Home
          </Link>

          <Link
            to="/new-arrivals"
            className="rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold text-cocoa/90 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Browse Finds
          </Link>

          <button
            type="button"
            aria-expanded={shopMenuOpen}
            onClick={() => setShopMenuOpen((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold transition-colors hover:bg-primary/10 hover:text-primary',
              shopMenuOpen ? 'bg-primary/10 text-primary' : 'text-cocoa/90',
            )}
          >
            <span>Collections</span>
            <ChevronDown
              className={cn('size-4 transition-transform', shopMenuOpen && 'rotate-180')}
            />
          </button>

          <Link
            to="/rentals"
            className="rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold text-cocoa/90 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Rentals
          </Link>

          <Link
            to="/events"
            className="rounded-full px-3.5 py-2 text-[0.9rem] lg:text-[1rem] font-bold text-cocoa/90 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            {preserveHomeHeader ? 'Store & Events' : 'Events'}
          </Link>
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            aria-label="Search"
            onClick={openSearch}
            className="hidden items-center gap-2.5 rounded-full border-2 border-foreground/30 bg-card/90 px-4 py-2 text-xs lg:text-sm font-semibold text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm sm:flex"
          >
            <Search className="size-4 text-primary" strokeWidth={2.4} />
            <span>Search vintage finds...</span>
          </button>

          <button
            type="button"
            aria-label="Search"
            onClick={openSearch}
            className="flex sm:hidden size-10 items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa"
          >
            <Search className="size-4" />
          </button>

          <Link
            to="/wishlist"
            aria-label={`Wishlist (${wishlistIds.length} saved)`}
            className="relative flex size-10 items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm"
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
            className="relative flex size-10 items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm"
          >
            <ShoppingBag className="size-5" strokeWidth={2} />
            {totals.itemCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.62rem] font-bold text-primary-foreground shadow-xs">
                {totals.itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Half-page width, content-fit height desktop Collections drop */}
      {shopMenuOpen && (
        <div
          role="dialog"
          aria-label="CircleUp Collections Directory"
          className="hidden md:block absolute left-1/2 top-full -translate-x-1/2 w-[54vw] min-w-[560px] max-w-[820px] border-x-2 border-b-2 border-foreground/20 bg-[#f8f4e2] z-40 shadow-2xl"
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
                          className="block text-[0.84rem] font-medium text-cocoa/90 hover:text-primary hover:translate-x-0.5 transition-all"
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
                  className="text-terracotta hover:text-primary"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile expandable directory */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-foreground/15 bg-[#f8f4e2] px-6 py-6 max-h-[80vh] overflow-y-auto space-y-6">
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
                    className="text-sm font-medium text-cocoa hover:text-primary py-1"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
      <h3 className="font-body text-[0.78rem] font-semibold tracking-normal text-footer-foreground">
        {title}
      </h3>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-[0.72rem] text-footer-foreground/75 transition-colors hover:text-footer-foreground"
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
    <footer className="bg-footer text-footer-foreground border-t-2 border-[#f7f3e1]/20">
      <div
        className={cn(
          'grid gap-12 py-16 sm:grid-cols-3 lg:grid-cols-[1.5fr_repeat(3,minmax(0,0.8fr))] lg:py-20',
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
    </footer>
  );
}

export function StorefrontPaperWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full frame-layered-bg p-2.5 sm:p-4 md:p-5 lg:p-6 overflow-x-hidden">
      <div className="relative w-full">
        <div
          aria-hidden
          className="paper-underlayer-1 absolute inset-0 translate-x-1.5 translate-y-2 sm:translate-x-2.5 sm:translate-y-3.5 rounded-[1.4rem] sm:rounded-[1.9rem]"
        />
        <div
          aria-hidden
          className="paper-underlayer-2 absolute inset-0 translate-x-0.5 translate-y-1 sm:translate-x-1 sm:translate-y-1.5 rounded-[1.4rem] sm:rounded-[1.9rem]"
        />

        <div className="paper-sheet-3d relative w-full overflow-clip rounded-[1.4rem] sm:rounded-[1.9rem] text-foreground bg-[#f8f4e2]">
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
      <main className={cn('py-10 sm:py-14 min-h-[70vh]', pad)}>
        <Outlet />
      </main>
      <StorefrontFooter />
    </StorefrontPaperWrapper>
  );
}

