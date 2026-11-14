import { useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

import bag1 from '@/assets/bag-1.jpg';
import bag2 from '@/assets/bag-2.jpg';
import bag3 from '@/assets/bag-3.jpg';
import bag4 from '@/assets/bag-4.jpg';
import communityVignette from '@/assets/community-vignette.svg';
import crumpledPaper from '@/assets/crumpled-paper.jpg';
import heroDetail1 from '@/assets/hero-detail-1.jpg';
import heroDetail2 from '@/assets/hero-detail-2.jpg';
import lookbook from '@/assets/lookbook.jpg';
import rtw1 from '@/assets/rtw-1.jpg';
import rtw2 from '@/assets/rtw-2.jpg';
import rtw3 from '@/assets/rtw-3.jpg';
import rtw4 from '@/assets/rtw-4.jpg';
import storyInset from '@/assets/story-inset.webp';
import storyInsetSmall from '@/assets/story-inset-480.webp';
import story2 from '@/assets/story-2.jpg';
import winter1 from '@/assets/winter-1.jpg';
import worldSocial from '@/assets/world-social-circle.webp';
import worldSocialSmall from '@/assets/world-social-circle-480.webp';
import { Reveal } from '@/components/landing/Reveal';
import { ScrollIvyBranch } from '@/components/landing/ScrollIvyBranch';
import { TreasureChestHero } from '@/components/landing/TreasureChestHero';
import { Blob } from '@/components/ui/Blob';
import { WaveDivider } from '@/components/ui/WaveDivider';
import { NotebookPage } from '@/components/ui/NotebookPage';
import { SpiralBinding } from '@/components/ui/SpiralBinding';
import {
  StorefrontFooter,
  StorefrontHeader,
  StorefrontTopBanner,
} from '@/components/storefront/StorefrontChrome';
import { useStore } from '@/context/StoreContext';
import { cn } from '@/lib/utils';
import { subscribeToScrollFrames } from '@/lib/scrollScheduler';
import { formatPrice } from '@/services/cartService';
import { productService } from '@/services/productService';

interface ProductPreview {
  id: string;
  img: string;
  name: string;
  price: string;
  width: number;
  height: number;
  aspect: string;
  to: string;
}

const readyToWear: ProductPreview[] = [
  {
    id: 'cu-001',
    img: rtw1,
    name: 'Top & Skirt Co-Ord Set',
    price: formatPrice(4000),
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/product/top-and-skirt-co-ord-set',
  },
  {
    id: 'cu-002',
    img: rtw2,
    name: 'Denim Fit & Flare Co-Ord Set',
    price: formatPrice(1950),
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/product/denim-fit-and-flare-co-ord-set',
  },
  {
    id: 'cu-003',
    img: rtw3,
    name: 'Blazer With Skirt Co-Ord Set',
    price: formatPrice(3550),
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/product/blazer-with-skirt-co-ord-set',
  },
  {
    id: 'cu-004',
    img: rtw4,
    name: 'Denim Jumpsuit Co-Ord Set',
    price: formatPrice(4950),
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/product/denim-jumpsuit-co-ord-set',
  },
];

const handbags: ProductPreview[] = [
  {
    id: 'cu-029',
    img: bag1,
    name: 'Textured Handheld Bag',
    price: formatPrice(2550),
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/product/textured-handheld-bag',
  },
  {
    id: 'cu-030',
    img: bag2,
    name: 'Textured Bowling Sling Bag',
    price: formatPrice(1850),
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/product/textured-bowling-sling-bag',
  },
  {
    id: 'cu-031',
    img: bag3,
    name: 'PU Structured Handheld Bag',
    price: formatPrice(5150),
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/product/pu-structured-handheld-bag',
  },
  {
    id: 'cu-032',
    img: bag4,
    name: 'Design Structured Satchel Bag',
    price: formatPrice(9550),
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/product/design-structured-satchel-bag',
  },
];

const winterLooks = [
  { img: winter1, alt: 'Winter cardigan coat with cream trim' },
  { img: heroDetail2, alt: 'Denim jumpsuit with a vintage belt' },
  { img: story2, alt: 'Vintage-inspired knit and denim co-ord on a mannequin' },
  { img: heroDetail1, alt: 'Top and skirt co-ord set on a mannequin' },
];

const pad = 'px-5 sm:px-10 lg:px-14 xl:px-20 2xl:px-28 max-w-[1680px] mx-auto';

function SeeMore({
  to = '/new-arrivals',
  label = 'see more',
  className,
}: {
  to?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex min-h-[44px] shrink-0 items-center gap-3 text-[0.8rem] text-cocoa hover:text-primary',
        className,
      )}
    >
      {label}
      <svg
        viewBox="0 0 28 12"
        aria-hidden
        className="h-3 w-7 transition-transform duration-300 group-hover:translate-x-1"
      >
        <path d="M1 7c8-3 16-3 25-1m-5-5 5 5-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

function Pin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 34"
      aria-hidden
      className={cn('absolute z-10 h-8 w-7 drop-shadow-sm', className)}
    >
      <path d="M13 17 L12.2 32 L14 32 Z" fill="#6b7462" />
      <circle cx="14" cy="11" r="9" fill="#2f3e24" />
      <circle cx="11" cy="8" r="3" fill="#7c9367" opacity=".75" />
    </svg>
  );
}

function Clip({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 40"
      aria-hidden
      className={cn('absolute z-10 h-9 w-8 drop-shadow-sm', className)}
    >
      <path d="M9 18 V8 a9 9 0 0 1 18 0 V18" fill="none" stroke="#6f7a65" strokeWidth="2" />
      <rect x="3" y="16" width="30" height="20" rx="4" fill="#8fa17b" />
      <rect x="3" y="16" width="30" height="7" rx="3.5" fill="#b4c39f" />
    </svg>
  );
}

function SectionHeading({
  title,
  to = '/new-arrivals',
  eyebrow = 'Curated Finds',
  blurb,
}: {
  title: string;
  to?: string;
  eyebrow?: string;
  blurb?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-foreground/20 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="display-title mt-2">{title}</h2>
        {blurb && <p className="prose-lead mt-2 max-w-lg">{blurb}</p>}
      </div>
      <SeeMore to={to} />
    </div>
  );
}

function ProductCard({
  product,
  badge = 'Vintage Find',
}: {
  product: ProductPreview;
  badge?: string;
}) {
  const { isWishlisted, toggleWishlist } = useStore();
  const saved = isWishlisted(product.id);
  return (
    <article className="home-product-card group relative h-full rounded-[1.4rem] border border-foreground/15 bg-card/95 p-3 shadow-soft backdrop-blur-xs">
      <Link to={product.to} className="block rounded-[1rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <div className="absolute top-4 left-4 z-10 rounded-full border border-primary/20 bg-primary px-2.5 py-1 text-[0.62rem] font-bold tracking-wider text-primary-foreground uppercase shadow-sm">
          {badge}
        </div>
        <Blob
          src={product.img}
          alt={product.name}
          width={product.width}
          height={product.height}
          shape="arch"
          className="home-product-media aspect-[4/5] border border-foreground/10 bg-tile"
          imageClassName="home-product-image w-full object-cover saturate-[1.02] contrast-[1.02] transition-transform duration-700 ease-out group-hover:scale-[1.05]"
          onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
          onError={(event) => event.currentTarget.classList.add('is-loaded')}
        />

        <div className="mt-3.5 flex min-h-[5.5rem] flex-col justify-between px-1">
          <h3 className="font-body text-[0.88rem] sm:text-[0.94rem] font-bold text-cocoa transition-colors group-hover:text-primary line-clamp-1">
            {product.name}
          </h3>
          <div className="mt-2 flex items-center justify-between">
            <p className="font-body text-[0.88rem] sm:text-[0.98rem] font-black text-destructive tabular-nums">
              {product.price}
            </p>
            <span className="text-[0.72rem] font-bold text-terracotta underline-offset-4 group-hover:underline">
              View piece →
            </span>
          </div>
        </div>
      </Link>
      <button
        type="button"
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        className={cn(
          'absolute top-4 right-4 z-10 flex size-[44px] items-center justify-center rounded-full border border-foreground/15 bg-background/90 text-cocoa shadow-sm backdrop-blur-xs transition-all duration-200 hover:text-primary',
          saved
            ? 'opacity-100'
            : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
        )}
        onClick={() => toggleWishlist(product.id, product.name)}
      >
        <Heart className={cn('size-4', saved && 'fill-primary text-primary')} strokeWidth={2.2} />
      </button>
    </article>
  );
}

function ProductSection({
  id,
  title,
  products,
  to,
  eyebrow,
  blurb,
}: {
  id: string;
  title: string;
  products: ProductPreview[];
  to: string;
  eyebrow?: string;
  blurb?: string;
}) {
  return (
    <section id={id} className={cn('home-vine-section scroll-mt-28 py-12 lg:py-16', pad)}>
      <SectionHeading title={title} to={to} eyebrow={eyebrow} blurb={blurb} />
      {products.length === 0 ? (
        <div className="mt-7 border border-dashed border-foreground/20 p-8 text-center text-xs text-muted-foreground">
          No items listed yet in this section. Real items added to your database will appear here automatically.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {products.map((product, idx) => (
            <Reveal key={product.name} delay={idx * 80}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

function StorySection() {
  return (
    <section id="story" className={cn('home-vine-section scroll-mt-28 py-14 lg:py-20', pad)}>
      <Reveal className="grid items-stretch gap-12 lg:grid-cols-[0.94fr_1.06fr] lg:gap-14">
        <div className="relative">
          <NotebookPage className="story-photo-page mx-auto w-full max-w-[34rem] rounded-[1.6rem] p-3 sm:p-4">
          <div className="photo-mat rounded-[1.6rem] p-2 shadow-lift">
            <Blob
              src={rtw1}
              sizes="(min-width: 1024px) 38vw, 100vw"
              alt="A vintage co-ord set carefully chosen for its next chapter"
              width={912}
              height={1200}
              shape="wavy-oval"
              outline
              className="aspect-[4/4.6] w-full"
              imageClassName="object-top"
            />
          </div>
          </NotebookPage>
        </div>

        <div className="flex flex-col lg:pl-4">
          <span className="eyebrow mb-4">Our story</span>
          <h2 className="display-title text-steel">
            Every thrifted
            <br />
            piece carries a story
          </h2>
          <span aria-hidden className="section-rule" />
          <div className="mt-8 grid flex-1 items-end gap-8 sm:grid-cols-[0.82fr_1fr]">
            <div
              style={{ transform: 'translateY(calc(var(--p-story, 0) * -22px))' }}
              className="relative mx-auto w-full max-w-[15rem] pt-4 will-change-transform sm:mx-0"
            >
              <Clip className="top-0 left-1/2 -translate-x-1/2" />
              <div className="rounded-2xl border border-foreground/20 bg-card/80 p-1.5 shadow-[0_14px_30px_-22px_rgb(30_45_20/0.45)]">
                <Blob
                  src={storyInset}
                  srcSet={`${storyInsetSmall} 480w, ${storyInset} 768w`}
                  sizes="(min-width: 640px) 240px, 85vw"
                  alt="Leafy wooden trellis decor inside the CircleUp shop"
                  width={768}
                  height={1024}
                  shape="arch"
                  className="aspect-[4/5] w-full"
                />
              </div>
            </div>
            <p className="prose-lead max-w-[24rem] sm:pb-6">
              A time, a place, a person. Instead of being forgotten, these clothes are given a new
              life, a new chapter, and a new home. Our collection brings together timeless finds,
              curated with care, so you can wear something unique, sustainable, and full of
              character.
            </p>
          </div>
          <SeeMore to="/about" label="Learn more" className="mt-8 self-start lg:self-end" />
        </div>
      </Reveal>
    </section>
  );
}

function WinterSection() {
  return (
    <section id="winter" className={cn('home-vine-section scroll-mt-28 py-14 lg:py-16', pad)}>
      <Reveal className="grid gap-8 lg:grid-cols-[0.36fr_1fr]">
        <div className="flex flex-col lg:items-end">
          <span className="eyebrow mb-4">Seasonal edit</span>
          <h2 className="display-title text-steel lg:text-right">
            winter
            <br />
            collection
          </h2>
          <p className="prose-lead mt-4 max-w-[20rem] lg:text-right">
            Layered knits, cardigan coats and varsity finds for the cold months.
          </p>
          <span aria-hidden className="section-rule lg:ml-auto" />
          <div
            style={{ transform: 'translateY(calc(var(--p-winter, 0) * -20px))' }}
            className="mt-8 w-full max-w-[11rem] will-change-transform lg:mt-auto lg:self-start"
          >
            <p className="mb-2 text-[0.62rem] tracking-[0.18em] text-foreground/80">LOOK</p>
            <div className="relative">
              <Pin className="-top-3 -left-2" />
              <NotebookPage className="rounded-xl p-3">
              <div className="rounded-xl border border-foreground/20 bg-card p-1.5 shadow-[0_14px_30px_-22px_rgb(30_45_20/0.45)]">
                <Blob
                  src={lookbook}
                  alt="Winter lookbook flat-lay"
                  width={912}
                  height={1104}
                  shape="petal"
                  className="aspect-[4/5] w-full"
                />
              </div>
              </NotebookPage>
            </div>
            <SeeMore to="/thrifted-treasure" className="mt-4" />
          </div>
        </div>

        <div
          style={{ transform: 'translateY(calc(var(--p-winter, 0) * 14px))' }}
          className="rounded-[1.5rem] border border-foreground/20 bg-card/60 p-2 will-change-transform"
        >
          <div className="grid grid-cols-2 overflow-hidden rounded-[1.1rem] lg:h-[31rem] lg:grid-cols-4">
            {winterLooks.map((look) => (
              <img
                key={look.alt}
                src={look.img}
                alt={look.alt}
                width={1008}
                height={1312}
                loading="lazy"
                decoding="async"
                className="aspect-[3/4] w-full object-cover object-top lg:aspect-auto lg:h-full"
              />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function CommunitySection() {
  return (
    <section id="community" className={cn('home-vine-section scroll-mt-28 pt-14 pb-14 lg:pt-16 lg:pb-20', pad)}>
      <Reveal className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8">
        <NotebookPage className="community-photo-page mx-auto w-full max-w-[31rem] justify-self-center rounded-[2rem] p-3 sm:p-4">
        <Blob
          src={communityVignette}
          alt="Illustration of a curated clothing rail, vintage handbag, and leafy plant"
          width={900}
          height={900}
          shape="arch"
          outline
          style={{ transform: 'translateY(calc(var(--p-comm, 0) * -16px))' }}
          className="aspect-square w-full will-change-transform"
        />
        </NotebookPage>
        <div
          style={{ transform: 'translateY(calc(var(--p-comm, 0) * 16px))' }}
          className="flex flex-col justify-between gap-8 will-change-transform"
        >
          <div className="flex flex-col lg:items-end">
            <span className="eyebrow mb-4">The Social Circle</span>
            <h2 className="display-title max-w-[26rem] lg:text-right">
              Join Our Community And Offline Store Sales
            </h2>
            <p className="prose-lead mt-5 max-w-[24rem] lg:text-right">
              Good clothes deserve a second story. Come browse the rails, meet our little crew, and
              leave with something that feels like it was waiting for you.
            </p>
            <span aria-hidden className="section-rule lg:ml-auto" />
            <SeeMore to="/events" label="Learn more" className="mt-7 self-start lg:self-end" />
          </div>
          <Blob
              src={worldSocial}
              srcSet={`${worldSocialSmall} 480w, ${worldSocial} 768w`}
            sizes="(min-width: 1024px) 46vw, 100vw"
              alt="Warm lights and leafy branches at a CircleUp community event"
            width={768}
            height={1024}
            shape="arch"
            className="community-detail-image ml-auto aspect-[4/3] w-full max-w-[31rem] border border-foreground/15"
          />
        </div>
      </Reveal>
    </section>
  );
}

const VALUES = [
  'Thrifted with care',
  'Rentals for every occasion',
  'Handcrafted pieces',
  'Plastic-free packaging',
  'Community sale days',
  'Fashion that lasts',
];

/** Slow looping band of brand values; second copy is hidden from assistive tech. */
function ValuesMarquee() {
  return (
    <div
      className="values-marquee relative z-20 overflow-hidden border-y border-[#f7f3e1]/15 bg-footer py-3.5 text-[#f8f4e2]"
      role="region"
      aria-label="What CircleUp stands for"
    >
      <div className="values-marquee-track">
        {[false, true].map((duplicate) => (
          <ul
            key={duplicate ? 'duplicate' : 'primary'}
            aria-hidden={duplicate || undefined}
            className="flex w-max shrink-0 items-center"
          >
            {VALUES.map((value) => (
              <li
                key={`${value}-${duplicate ? 'duplicate' : 'primary'}`}
                className="flex items-center gap-8 pr-8 text-[0.78rem] font-semibold tracking-[0.22em] uppercase"
              >
                {value}
                <span aria-hidden className="size-1.5 rounded-full bg-sage-glow" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

const worlds: Array<{
  to: string;
  title: string;
  note: string;
  img: string;
  alt: string;
  srcSet?: string;
  sizes?: string;
}> = [
  { to: '/rentals', title: 'Rentals', note: 'Wear for an occasion, then return it', img: rtw3, alt: 'Blazer with skirt co-ord set' },
  { to: '/thrifted-treasure', title: 'Thrifted Treasure', note: 'One-of-one vintage finds', img: heroDetail1, alt: 'Top and skirt co-ord set on a mannequin' },
  { to: '/accessories', title: 'Accessories', note: 'Bags, scarves and small things', img: bag3, alt: 'Structured handheld bag' },
  {
    to: '/events',
    title: 'Social Circle',
    note: 'Store sales and community days',
    img: worldSocial,
    srcSet: `${worldSocialSmall} 480w, ${worldSocial} 768w`,
    sizes: '(min-width: 1024px) 24vw, 50vw',
    alt: 'Warm lights and leafy branches decorate the CircleUp shop',
  },
];

function WorldsSection() {
  return (
    <section id="worlds" className={cn('home-vine-section scroll-mt-28 py-12 lg:py-16', pad)}>
      <SectionHeading
        eyebrow="Explore the circle"
        title="Find your world"
        blurb="Four ways into CircleUp, whether you want to buy, borrow, browse or meet us."
        to="/new-arrivals"
      />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {worlds.map((w, idx) => (
          <Reveal key={w.to} delay={idx * 80}>
            <Link
              to={w.to}
              className={cn(
                'category-tile tile-zoom group relative block aspect-[4/5] overflow-hidden rounded-[50%_50%_8%_8%/30%_30%_4%_4%] border border-foreground/20 shadow-soft transition-shadow duration-500 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
              )}
            >
              <img
                src={w.img}
                srcSet={w.srcSet}
                sizes={w.sizes}
                alt={w.alt}
                width={w.srcSet ? 768 : 1008}
                height={w.srcSet ? 1024 : 1260}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full object-cover object-top"
              />
              <span className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-[#f8f4e2]/90 text-forest-deep transition-transform duration-500 ease-out-soft group-hover:-rotate-45 sm:right-4 sm:top-4">
                <svg viewBox="0 0 16 16" aria-hidden className="size-4">
                  <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              <span className="absolute inset-x-3 bottom-3 rounded-[1rem_1.2rem_0.85rem_1.1rem] border border-foreground/10 bg-background/95 p-3 text-cocoa shadow-soft sm:p-4">
                <span className="block font-display text-[clamp(0.95rem,1.15vw,1.35rem)] leading-tight">
                  {w.title}
                </span>
                <span className="mt-1 block text-[0.72rem] leading-snug text-muted-foreground sm:text-[0.78rem]">
                  {w.note}
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ClosingBanner() {
  return (
    <section className={cn('home-vine-section pb-16 lg:pb-24', pad)}>
      <Reveal>
        <div className="notebook-cover organic-panel relative overflow-hidden px-7 py-14 text-center text-primary-foreground shadow-lift sm:px-14 lg:py-20">
          <SpiralBinding />
          <span className="eyebrow text-sage-glow">Fashion that lasts</span>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-[clamp(2rem,1.2rem+3vw,3.6rem)] leading-[1.05] text-[#f8f4e2]">
            Give a good piece its next chapter.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[0.98rem] leading-relaxed text-[#f8f4e2]/80">
            New-to-you treasures, found slowly and ready for their next chapter.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/new-arrivals" className="leaf-cta">
              <svg viewBox="0 0 300 94" aria-hidden="true" className="leaf-cta-shape">
                <path className="leaf-cta-fill" d="M7 47C53 5 204 2 293 47 204 91 53 89 7 47Z" />
                <path className="leaf-cta-vein" d="M17 47c80-4 177-3 266 0M145 45c-20-12-38-20-58-24m59 27c-19 11-37 19-58 23" />
              </svg>
              <span>Browse new arrivals</span>
              <span className="leaf-cta-arrow" aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function HomePage() {
  const belowHeroRef = useRef<HTMLDivElement>(null);
  const vineTrailRef = useRef<HTMLDivElement>(null);
  const allProducts = productService.getAllProducts();
  const isDbLive = productService.isDatabaseLive();

  useEffect(() => {
    const root = belowHeroRef.current;
    if (!root || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const sections: Array<[string, string]> = [
      ['story', '--p-story'],
      ['winter', '--p-winter'],
      ['community', '--p-comm'],
    ];
    const trackedSections = sections
      .map(([id, cssVar]) => {
        const element = document.getElementById(id);
        return element ? { element, cssVar } : null;
      })
      .filter((section): section is { element: HTMLElement; cssVar: string } => section !== null);
    const sectionElements = trackedSections.map(({ element }) => element);
    const positions = new Map<HTMLElement, { top: number; height: number }>();
    const measure = () => {
      sectionElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        positions.set(element, { top: rect.top + window.scrollY, height: rect.height });
      });
    };
    measure();

    const update = (scrollY: number, _now: number, viewportHeight: number) => {
      trackedSections.forEach(({ element, cssVar }) => {
        const position = positions.get(element);
        if (!position) return;
        const center = position.top + position.height / 2 - scrollY;
        const progress = Math.max(
          -1,
          Math.min(1, (viewportHeight / 2 - center) / (viewportHeight * 0.75)),
        );
        root.style.setProperty(cssVar, progress.toFixed(3));
      });
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    sectionElements.forEach((element) => resizeObserver?.observe(element));

    const activeSections = new Set<Element>();
    let unsubscribe: (() => void) | null = null;
    const start = () => {
      if (unsubscribe) return;
      unsubscribe = subscribeToScrollFrames(update);
    };
    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
    };
    if (typeof IntersectionObserver === 'undefined') {
      start();
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) activeSections.add(entry.target);
            else activeSections.delete(entry.target);
          });
          if (activeSections.size > 0) start();
          else stop();
        },
        { rootMargin: '120px 0px' },
      );
      sectionElements.forEach((element) => observer.observe(element));
      return () => {
        observer.disconnect();
        stop();
        resizeObserver?.disconnect();
      };
    }

    return () => {
      stop();
      resizeObserver?.disconnect();
    };
  }, []);

  const liveReadyToWear: ProductPreview[] = allProducts
    .filter((p) => p.category === 'womens-one-piece' || p.category === 'womens-upperwear')
    .slice(0, 4)
    .map((p) => ({
      id: p.id,
      img: p.images[0] || rtw1,
      name: p.name,
      price: formatPrice(p.price),
      width: 912,
      height: 1200,
      aspect: 'aspect-[4/5]',
      to: `/product/${p.slug}`,
    }));

  const liveHandbags: ProductPreview[] = allProducts
    .filter((p) => p.category === 'accessories' || p.tags.includes('bag') || p.category === 'thrifted-treasure')
    .slice(0, 4)
    .map((p) => ({
      id: p.id,
      img: p.images[0] || bag1,
      name: p.name,
      price: formatPrice(p.price),
      width: 1008,
      height: 1008,
      aspect: 'aspect-square',
      to: `/product/${p.slug}`,
    }));

  const activeReadyToWear = isDbLive ? liveReadyToWear : (liveReadyToWear.length > 0 ? liveReadyToWear : readyToWear);
  const activeHandbags = isDbLive ? liveHandbags : (liveHandbags.length > 0 ? liveHandbags : handbags);

  return (
    <div className="relative min-h-screen w-full bg-[#f8f4e2] overflow-x-clip">
      <div className="relative w-full">

        <div className="paper-sheet-3d paper-fullscreen relative w-full min-h-screen overflow-clip text-foreground bg-[#f8f4e2]">
          <div
            aria-hidden
            className="paper-slight-crinkle"
            style={{
              backgroundImage: `url(${crumpledPaper})`,
            }}
          />
          <div aria-hidden className="paper-ambient-sheen" />

          <div className="home-vine-footer relative z-20">
            <StorefrontTopBanner />
            <StorefrontHeader preserveHomeHeader />
            <div className="home-vine-frame relative">
              <main id="main" className="relative z-20">
                <TreasureChestHero />
                <div ref={belowHeroRef} className="relative">
                  <div className="relative z-20">
                    <ValuesMarquee />
                    <WaveDivider className="relative z-20 -mb-px bg-background text-sage-tint" />
                  </div>
                  <div ref={vineTrailRef} className="relative">
                    <ScrollIvyBranch containerRef={vineTrailRef} />
                    <div className="relative z-20">
                      <ProductSection
                        id="ready-to-wear"
                        title="Ready-To-Wear"
                        eyebrow="Ready to wear"
                        blurb="Co-ords, one-pieces and everyday tops, each one thrifted, checked and ready for a second life."
                        products={activeReadyToWear}
                        to="/womens-one-piece"
                      />
                      <ProductSection
                        id="handbags"
                        title="Handbags Collection"
                        eyebrow="Carry it well"
                        blurb="Structured satchels, slings and handhelds with plenty of life left in them."
                        products={activeHandbags}
                        to="/accessories"
                      />
                      <WorldsSection />
                      <StorySection />
                      <WinterSection />
                      <CommunitySection />
                      <WaveDivider className="relative z-20 -mb-px bg-background text-primary" />
                      <ClosingBanner />
                    </div>
                  </div>
                </div>
              </main>
              <div className="relative z-20">
                <StorefrontFooter />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

