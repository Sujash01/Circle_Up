import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileCode2, Search } from 'lucide-react';
import { productService } from '@/services/productService';

interface SitemapSection {
  title: string;
  eyebrow: string;
  description: string;
  links: Array<{
    name: string;
    path: string;
    description?: string;
    isExternal?: boolean;
  }>;
}

const SITEMAP_SECTIONS: SitemapSection[] = [
  {
    title: 'Curated Collections',
    eyebrow: 'Drops & Finds',
    description: 'Our core discovery rails, seasonal edits, and slow-curated selections.',
    links: [
      { name: 'Home / Landing', path: '/', description: 'The CircleUp story, curated showcase, and live chest picks' },
      { name: 'New Arrivals', path: '/new-arrivals', description: 'Freshly catalogued thrift and studio additions' },
      { name: 'Brand New', path: '/brand-new', description: 'Mint, unworn contemporary drops and curated pieces' },
      { name: 'Thrifted Rail', path: '/thrifted', description: 'Handpicked pre-loved treasures and verified vintage rails' },
      { name: 'Thrifted Treasure', path: '/thrifted-treasure', description: 'One-of-one rare archive pieces and vintage finds' },
      { name: 'Handcrafted Goods', path: '/handcrafted', description: 'Upcycled textiles, crochet, and studio artisanal crafts' },
    ],
  },
  {
    title: 'Apparel Catalog',
    eyebrow: 'Garments & Rails',
    description: 'Every vintage garment inspected, graded, and measured for accurate fit.',
    links: [
      { name: "Women's Upperwear", path: '/womens-upperwear', description: 'Blouses, shirts, knitwear, and everyday tops' },
      { name: "Women's Bottomwear", path: '/womens-bottomwear', description: 'Vintage denim, linen trousers, cargos, and skirts' },
      { name: "Women's One-Piece", path: '/womens-one-piece', description: 'Co-ord sets, dresses, jumpsuits, and rompers' },
      { name: "Men's Upperwear", path: '/mens-upperwear', description: 'Oversized tees, jackets, varsity crewnecks, and shirts' },
      { name: "Men's Bottomwear", path: '/mens-bottomwear', description: 'Pleated chinos, relaxed carpenter jeans, and shorts' },
      { name: 'Ethnic Wear', path: '/ethnic-wear', description: 'Handloom kurtas, raw silk bundis, and traditional sets' },
      { name: 'Footwear', path: '/footwear', description: 'Vintage leather loafers, court trainers, and ankle boots' },
    ],
  },
  {
    title: 'Accessories & Accents',
    eyebrow: 'Finishing Details',
    description: 'Bags, scarves, rings, and curious vintage details.',
    links: [
      { name: 'Handbags & Slings', path: '/accessories', description: 'Structured satchels, tote bags, and leather crossbodies' },
      { name: 'Jewellery & Brooches', path: '/jewellery', description: 'Brass scarf rings, signet rings, cuffs, and brooches' },
      { name: 'Scarves & Accessories', path: '/accessories', description: 'Botanical silk scarves, brass buckle belts, and socks' },
    ],
  },
  {
    title: 'Community & Services',
    eyebrow: 'The Social Circle',
    description: 'Offline swap sales, community street snaps, and circular services.',
    links: [
      { name: 'The Social Circle Events', path: '/events', description: 'Offline store sales, community swap days, and workshops' },
      { name: '#ThriftCrew Gallery', path: '/thriftcrew', description: 'Customer lookbook and community styling photos' },
      { name: 'Customer Reviews', path: '/reviews', description: 'Verified feedback, fit notes, and customer testimonials' },
      { name: 'Wardrobe Rentals', path: '/rentals', description: 'Borrow occasion garments and return them simply' },
    ],
  },
  {
    title: 'Customer Experience',
    eyebrow: 'Accounts & Bag',
    description: 'Your personal wardrobe dashboard, saved pieces, and checkout.',
    links: [
      { name: 'Shopping Bag', path: '/cart', description: 'Review your items and proceed with verified checkout' },
      { name: 'Saved Wishlist', path: '/wishlist', description: 'Your saved favorite finds and wishlist collection' },
      { name: 'Catalog Search', path: '/search', description: 'Full catalog search by keyword, tag, or material' },
      { name: 'Sign In', path: '/signin', description: 'Access your saved address and customer profile' },
      { name: 'Create Account', path: '/signup', description: 'Join CircleUp and earn circular community perks' },
      { name: 'Customer Dashboard', path: '/account', description: 'Manage shipping address, orders, and preferences' },
      { name: 'Password Recovery', path: '/forgot-password', description: 'Reset your account password securely' },
    ],
  },
  {
    title: 'Brand & Studio',
    eyebrow: 'Information & Legal',
    description: 'Who we are, how we source, and how to get in touch.',
    links: [
      { name: 'About CircleUp', path: '/about', description: 'The brand story: a little bit thrift store, a little bit treasure hunt' },
      { name: 'Contact Studio', path: '/contact', description: 'Get in touch for sizing, returns, or consignment questions' },
      { name: 'XML Sitemap', path: '/sitemap.xml', description: 'Machine-readable search engine index file', isExternal: true },
      { name: 'Admin Workspace', path: '/admin', description: 'Curator CRM, inventory manager, orders, and coupon settings' },
    ],
  },
];

export function SitemapPage() {
  const [productFilter, setProductFilter] = useState('');
  const allProducts = productService.getAllProducts();

  const filteredProducts = useMemo(() => {
    if (!productFilter.trim()) return allProducts;
    const q = productFilter.toLowerCase().trim();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.categoryLabel.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q),
    );
  }, [allProducts, productFilter]);

  return (
    <div className="space-y-12">
      {/* Editorial Header */}
      <header className="border-b border-foreground/15 pb-7">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">
              Site Architecture &amp; Index
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">Sitemap</h1>
            <p className="mt-3 text-sm leading-relaxed text-foreground/80">
              A comprehensive directory of all curated rails, seasonal drops, circular services,
              customer portals, and piece archives across CircleUp.
            </p>
          </div>

          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-card/60 px-4 py-2 text-xs font-semibold text-forest-deep hover:bg-forest/10 hover:border-forest/50 transition-colors shrink-0 self-start sm:self-auto"
          >
            <FileCode2 className="size-4 text-terracotta" />
            <span>XML Sitemap</span>
            <ArrowUpRight className="size-3.5 text-foreground/60" />
          </a>
        </div>
      </header>

      {/* Main Structural Categories */}
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {SITEMAP_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-4">
            <div className="border-b border-foreground/10 pb-2">
              <span className="text-[0.68rem] uppercase tracking-[0.2em] text-terracotta block">
                {section.eyebrow}
              </span>
              <h2 className="font-display text-2xl text-cocoa mt-0.5">{section.title}</h2>
              <p className="text-xs text-foreground/70 mt-1 leading-relaxed">
                {section.description}
              </p>
            </div>

            <ul className="space-y-3 pt-1">
              {section.links.map((link) => (
                <li key={link.path + link.name}>
                  {link.isExternal ? (
                    <a
                      href={link.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-cocoa group-hover:text-primary transition-colors">
                        <span>{link.name}</span>
                        <ArrowUpRight className="size-3 text-terracotta opacity-70 group-hover:opacity-100" />
                      </div>
                      {link.description && (
                        <p className="text-[0.75rem] text-foreground/65 leading-snug mt-0.5">
                          {link.description}
                        </p>
                      )}
                    </a>
                  ) : (
                    <Link to={link.path} className="group block">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-cocoa group-hover:text-primary transition-colors">
                        <span>{link.name}</span>
                        <span className="text-xs text-primary opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                          →
                        </span>
                      </div>
                      {link.description && (
                        <p className="text-[0.75rem] text-foreground/65 leading-snug mt-0.5">
                          {link.description}
                        </p>
                      )}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Direct Catalog Products Index */}
      <section className="border-t border-foreground/15 pt-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-terracotta">
              Direct Product Archive
            </p>
            <h2 className="font-display text-3xl text-cocoa mt-1">Catalog Directory</h2>
            <p className="text-xs text-foreground/75 mt-1">
              Direct access to all {allProducts.length} verified pieces currently archived in our catalog.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground/40" />
            <input
              type="text"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              placeholder="Filter pieces by name or category..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-card/60 border border-foreground/20 rounded-lg text-cocoa placeholder:text-foreground/45 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
          {filteredProducts.map((p) => (
            <Link
              key={p.id}
              to={`/product/${p.slug}`}
              className="group flex items-center gap-3 p-2 rounded-xl bg-card/40 border border-foreground/10 hover:border-primary/40 hover:bg-card/80 transition-all"
            >
              <img
                src={p.images[0]}
                alt={p.name}
                width={40}
                height={40}
                className="size-10 rounded-lg object-cover border border-foreground/10 shrink-0"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-cocoa truncate group-hover:text-primary transition-colors">
                  {p.name}
                </p>
                <p className="text-[0.7rem] text-terracotta truncate">
                  {p.categoryLabel}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
