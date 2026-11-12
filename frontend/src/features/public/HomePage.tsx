import { useRef } from 'react';
import { Heart, Search, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';

import bag1 from '@/assets/bag-1.jpg';
import bag2 from '@/assets/bag-2.jpg';
import bag3 from '@/assets/bag-3.jpg';
import bag4 from '@/assets/bag-4.jpg';
import community1 from '@/assets/community-1.jpg';
import community2 from '@/assets/community-2.jpg';
import crumpledPaper from '@/assets/crumpled-paper.jpg';
import heroDetail1 from '@/assets/hero-detail-1.jpg';
import heroDetail2 from '@/assets/hero-detail-2.jpg';
import heroModel from '@/assets/hero-model-cutout.png';
import lookbook from '@/assets/lookbook.jpg';
import rtw1 from '@/assets/rtw-1.jpg';
import rtw2 from '@/assets/rtw-2.jpg';
import rtw3 from '@/assets/rtw-3.jpg';
import rtw4 from '@/assets/rtw-4.jpg';
import story1 from '@/assets/story-1.jpg';
import story2 from '@/assets/story-2.jpg';
import winter1 from '@/assets/winter-1.jpg';
import { Reveal } from '@/components/landing/Reveal';
import { ScrollIvyBranch } from '@/components/landing/ScrollIvyBranch';
import { cn } from '@/lib/utils';

interface ProductPreview {
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
    img: rtw1,
    name: 'Top & Skirt Co-Ord Set',
    price: '₹ 4,000.00',
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/shop/womens-upperwear',
  },
  {
    img: rtw2,
    name: 'Denim Fit & Flare Co-Ord Set',
    price: '₹ 1,950.00',
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/shop/womens-one-piece',
  },
  {
    img: rtw3,
    name: 'Blazer With Skirt Co-Ord Set',
    price: '₹ 3,550.00',
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/shop/womens-upperwear',
  },
  {
    img: rtw4,
    name: 'Denim Jumpsuit Co-Ord Set',
    price: '₹ 4,950.00',
    width: 912,
    height: 1200,
    aspect: 'aspect-[4/5]',
    to: '/shop/womens-one-piece',
  },
];

const handbags: ProductPreview[] = [
  {
    img: bag1,
    name: 'Textured Handheld Bag',
    price: '₹ 2,550.00',
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/shop/accessories',
  },
  {
    img: bag2,
    name: 'Textured Bowling Sling Bag',
    price: '₹ 1,850.00',
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/shop/accessories',
  },
  {
    img: bag3,
    name: 'PU Structured Handheld Bag',
    price: '₹ 5,150.00',
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/shop/accessories',
  },
  {
    img: bag4,
    name: 'Design Structured Satchel Bag',
    price: '₹ 9,550.00',
    width: 1008,
    height: 1008,
    aspect: 'aspect-square',
    to: '/shop/accessories',
  },
];

const winterLooks = [
  { img: winter1, alt: 'Winter cardigan coat with cream trim' },
  { img: heroDetail2, alt: 'Knit top with olive cargo trousers' },
  { img: story2, alt: 'Vintage varsity sweatshirts with patched jeans' },
  { img: heroDetail1, alt: 'Ruffle-neck vintage knit top' },
];

const pad = 'px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1560px] mx-auto';

function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        'font-body text-2xl sm:text-[1.85rem] font-black tracking-tight text-cocoa transition-colors hover:text-primary flex items-center gap-2',
        className,
      )}
    >
      <span>CircleUp</span>
      <span className="inline-block size-2.5 rounded-full bg-primary" />
    </Link>
  );
}

function TopBanner() {
  return (
    <div className="bg-footer px-4 py-2.5 text-center text-[0.72rem] font-medium tracking-wide text-footer-foreground border-b border-[#f7f3e1]/15">
      Sign up and get 20% off new arrivals • Free sustainable packaging on all orders
    </div>
  );
}

function Header() {
  const links = [
    { label: 'Home', to: '/' },
    { label: 'Browse Finds', to: '/new-arrivals' },
    { label: 'Collections', to: '/shop/thrifted-treasure' },
    { label: 'Rentals', to: '/rentals' },
    { label: 'Store & Events', to: '/events' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b-2 border-foreground/15 bg-[#f8f4e2]/95 backdrop-blur-md shadow-xs transition-all">
      <div className={cn('flex items-center justify-between py-4 sm:py-5', pad)}>
        <Logo />

        <nav className="hidden items-center gap-1 md:flex lg:gap-2" aria-label="Storefront">
          {links.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="rounded-full px-4 py-2 text-[0.92rem] lg:text-[1.02rem] font-bold text-cocoa/90 transition-all duration-200 hover:bg-primary/10 hover:text-primary tracking-wide"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            to="/new-arrivals"
            aria-label="Search"
            className="hidden items-center gap-2.5 rounded-full border-2 border-foreground/30 bg-card/90 px-4 py-2 text-xs lg:text-sm font-semibold text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm sm:flex"
          >
            <Search className="size-4 text-primary" strokeWidth={2.4} />
            <span>Search vintage finds...</span>
          </Link>

          <Link
            to="/account/wishlist"
            aria-label="Wishlist"
            className="flex size-10 items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm"
          >
            <Heart className="size-5" strokeWidth={2} />
          </Link>

          <Link
            to="/cart"
            aria-label="Shopping bag"
            className="relative flex size-10 items-center justify-center rounded-full border-2 border-foreground/20 bg-card/90 text-cocoa shadow-xs transition-all hover:border-primary hover:text-primary hover:shadow-sm"
          >
            <ShoppingBag className="size-5" strokeWidth={2} />
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.62rem] font-bold text-primary-foreground shadow-xs">
              2
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

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
        'group inline-flex shrink-0 items-center gap-3 text-[0.8rem] text-cocoa hover:text-primary',
        className,
      )}
    >
      {label}
      <svg
        viewBox="0 0 88 10"
        aria-hidden
        className="h-2.5 w-[5.5rem] transition-transform duration-300 group-hover:translate-x-1"
      >
        <path d="M0 5h86M80.5 1l5.5 4-5.5 4" fill="none" stroke="currentColor" strokeWidth="1" />
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

function SectionHeading({ title, to = '/new-arrivals' }: { title: string; to?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b-2 border-foreground/15 pb-4 mb-7">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-[0.72rem] font-extrabold uppercase tracking-widest text-primary">
            Curated Finds
          </span>
        </div>
        <h2 className="text-[clamp(1.8rem,3vw,2.4rem)] leading-none text-cocoa font-medium">
          {title}
        </h2>
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
  return (
    <Link
      to={product.to}
      className="group relative block rounded-2xl border-2 border-foreground/15 bg-card/95 p-3 shadow-md backdrop-blur-xs transition-all duration-300 hover:-translate-y-2 hover:border-primary hover:shadow-xl"
    >
      <div className="absolute top-5 left-5 z-10 rounded-full border border-primary/20 bg-primary px-2.5 py-0.5 text-[0.62rem] font-bold tracking-wider text-primary-foreground uppercase shadow-sm">
        {badge}
      </div>

      <button
        type="button"
        aria-label="Save item"
        className="absolute top-5 right-5 z-10 flex size-8 items-center justify-center rounded-full border border-foreground/15 bg-background/90 text-cocoa opacity-0 shadow-sm backdrop-blur-xs transition-all duration-200 hover:text-primary group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Heart className="size-4" strokeWidth={2.2} />
      </button>

      <div className="overflow-hidden rounded-xl bg-[#efebd8] border border-foreground/10">
        <img
          src={product.img}
          alt={product.name}
          width={product.width}
          height={product.height}
          loading="lazy"
          className={cn(
            'w-full object-cover saturate-[1.02] contrast-[1.02] transition-transform duration-700 ease-out group-hover:scale-[1.05]',
            product.aspect,
          )}
        />
      </div>

      <div className="mt-3.5 px-1">
        <h3 className="font-body text-[0.88rem] sm:text-[0.94rem] font-bold text-cocoa transition-colors group-hover:text-primary line-clamp-1">
          {product.name}
        </h3>
        <div className="mt-2 flex items-center justify-between">
          <p className="font-body text-[0.88rem] sm:text-[0.98rem] font-black text-primary tabular-nums">
            {product.price}
          </p>
          <span className="text-[0.72rem] font-bold text-terracotta underline-offset-4 group-hover:underline">
            View piece →
          </span>
        </div>
      </div>
    </Link>
  );
}

function Hero() {
  return (
    <section className={cn('pt-6 pb-16 sm:pt-10 lg:pb-24', pad)}>
      <div className="grid gap-8 lg:min-h-[41rem] lg:grid-cols-[1fr_minmax(0,1.02fr)_1fr] lg:gap-0">
        <Reveal className="relative z-0 flex flex-col pt-2 lg:pt-6">
          <h1 className="text-[clamp(3.4rem,7.4vw,6rem)] leading-[0.95] whitespace-nowrap text-cocoa">
            Fashion
            <br />
            That Lasts<span className="text-primary">!</span>
          </h1>
          <p className="mt-6 max-w-[16.5rem] text-[0.68rem] leading-[1.75] text-terracotta">
            Handpicked Thrift Treasures, Each With A Story. Sustainable, Timeless, And Full Of
            Character. Waiting For Their Next Chapter.
          </p>
          <div className="mt-8 hidden w-44 flex-col gap-3 lg:mt-auto lg:flex">
            <img
              src={heroDetail1}
              alt="Close-up of a knit top"
              width={912}
              height={1200}
              loading="lazy"
              className="aspect-[4/5] w-24 rounded-lg border border-foreground/15 object-cover"
            />
            <Link
              to="/new-arrivals"
              className="rounded-md bg-steel px-6 py-2.5 text-center text-[0.72rem] font-medium text-primary-foreground transition-colors duration-300 hover:bg-forest-deep"
            >
              Explore More
            </Link>
          </div>
        </Reveal>

        <div className="relative z-10 -mx-2 flex justify-center lg:-ml-16 lg:-mr-6">
          <div
            aria-hidden
            className="pointer-events-none absolute top-[18%] left-[10%] size-[75%] rounded-full bg-[radial-gradient(closest-side,rgba(200,211,176,0.45),transparent)] blur-3xl"
          />
          <img
            src={heroModel}
            alt="Model styled in curated thrift outfit with olive cargo trousers"
            width={1024}
            height={1408}
            fetchPriority="high"
            className="relative w-full max-w-[34rem] object-contain drop-shadow-[0_14px_28px_rgba(25,35,18,0.16)] lg:max-w-none"
          />
        </div>

        <Reveal
          delay={150}
          className="relative z-20 flex flex-col items-start gap-10 text-left lg:items-end lg:justify-between lg:text-right"
        >
          <div className="flex flex-col lg:items-end">
            <p className="max-w-[13.5rem] font-display text-[clamp(1.2rem,1.8vw,1.6rem)] leading-[1.25] text-foreground">
              one-of-a-kind pieces with a story, ready to be yours!
            </p>
            <div className="mt-5 flex gap-2 rounded-xl border border-foreground/20 bg-card/80 p-1.5">
              <img
                src={heroDetail1}
                alt="Curated knit detail"
                width={912}
                height={1200}
                loading="lazy"
                className="aspect-[4/5] w-[4.2rem] rounded-lg object-cover"
              />
              <img
                src={heroDetail2}
                alt="Curated cargo trouser pairing"
                width={912}
                height={1200}
                loading="lazy"
                className="aspect-[4/5] w-[4.2rem] rounded-lg object-cover object-top"
              />
            </div>
          </div>
          <h2 className="text-[clamp(1.35rem,2.3vw,2rem)] leading-[1.2] text-cocoa lg:text-right">
            Curated Vintage &amp;
            <br className="hidden lg:block" /> Thrift Finds,
            <br className="hidden lg:block" /> Just For You!
          </h2>
        </Reveal>
      </div>
    </section>
  );
}

function ProductSection({
  id,
  title,
  products,
  to,
}: {
  id: string;
  title: string;
  products: ProductPreview[];
  to: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-6 py-10 lg:py-12', pad)}>
      <SectionHeading title={title} to={to} />
      <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.name} product={product} />
        ))}
      </div>
    </section>
  );
}

function StorySection() {
  return (
    <section id="story" className={cn('scroll-mt-6 py-14 lg:py-20', pad)}>
      <div className="grid items-stretch gap-12 lg:grid-cols-[0.94fr_1.06fr] lg:gap-14">
        <div className="relative">
          <div className="rounded-[1.6rem] border border-foreground/20 bg-card/70 p-2 shadow-[0_18px_40px_-26px_rgb(30_45_20/0.45)]">
            <img
              src={story1}
              alt="Plaid halter top with baggy jeans"
              width={1008}
              height={1312}
              loading="lazy"
              className="aspect-[4/4.7] w-full rounded-[1.2rem] object-cover object-top"
            />
          </div>
          <span
            aria-hidden
            className="plaid absolute top-5 -right-3 hidden h-[78%] w-5 shadow-md sm:block"
          />
        </div>

        <div className="flex flex-col lg:pl-4">
          <h2 className="text-[clamp(1.9rem,3.3vw,2.8rem)] leading-[1.12] text-steel">
            Every thrifted
            <br />
            piece carries a story
          </h2>
          <div className="mt-10 grid flex-1 items-end gap-8 sm:grid-cols-[0.82fr_1fr]">
            <div className="relative mx-auto w-full max-w-[15rem] pt-4 sm:mx-0">
              <Clip className="top-0 left-1/2 -translate-x-1/2" />
              <div className="rounded-2xl border border-foreground/20 bg-card/80 p-1.5 shadow-[0_14px_30px_-22px_rgb(30_45_20/0.45)]">
                <img
                  src={story2}
                  alt="Vintage graphic sweatshirts and patched jeans"
                  width={1008}
                  height={1200}
                  loading="lazy"
                  className="aspect-[4/5] w-full rounded-xl object-cover"
                />
              </div>
            </div>
            <p className="max-w-[19rem] text-[0.78rem] leading-[1.95] text-foreground/85 sm:pb-6">
              A time, a place, a person. Instead of being forgotten, these clothes are given a new
              life, a new chapter, and a new home. Our collection brings together timeless finds,
              curated with care, so you can wear something unique, sustainable, and full of
              character.
            </p>
          </div>
          <SeeMore to="/about" label="Learn more" className="mt-10 self-end" />
        </div>
      </div>
    </section>
  );
}

function WinterSection() {
  return (
    <section id="winter" className={cn('scroll-mt-6 py-14 lg:py-16', pad)}>
      <div className="grid gap-10 lg:grid-cols-[0.36fr_1fr] lg:gap-8">
        <div className="flex flex-col lg:items-end">
          <h2 className="text-[clamp(2rem,3.4vw,3rem)] leading-[1.08] text-steel lg:text-right">
            winter
            <br />
            collection
          </h2>
          <div className="mt-10 w-full max-w-[11rem] lg:mt-auto lg:self-start">
            <p className="mb-2 text-[0.62rem] tracking-[0.18em] text-foreground/80">LOOK</p>
            <div className="relative">
              <Pin className="-top-3 -left-2" />
              <div className="rounded-xl border border-foreground/20 bg-card p-1.5 shadow-[0_14px_30px_-22px_rgb(30_45_20/0.45)]">
                <img
                  src={lookbook}
                  alt="Winter lookbook flat-lay"
                  width={912}
                  height={1104}
                  loading="lazy"
                  className="aspect-[4/5] w-full rounded-lg object-cover"
                />
              </div>
            </div>
            <SeeMore to="/shop/thrifted-treasure" className="mt-4" />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-foreground/20 bg-card/60 p-2">
          <div className="grid grid-cols-2 overflow-hidden rounded-[1.1rem] lg:h-[31rem] lg:grid-cols-4">
            {winterLooks.map((look) => (
              <img
                key={look.alt}
                src={look.img}
                alt={look.alt}
                width={1008}
                height={1312}
                loading="lazy"
                className="aspect-[3/4] w-full object-cover object-top lg:aspect-auto lg:h-full"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CommunitySection() {
  return (
    <section id="community" className={cn('scroll-mt-6 pt-14 pb-20 lg:pt-16 lg:pb-28', pad)}>
      <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8">
        <img
          src={community1}
          alt="Crowded vintage market sale"
          width={1104}
          height={1104}
          loading="lazy"
          className="aspect-[10/11] w-full rounded-[1.4rem] object-cover border border-foreground/15"
        />
        <div className="flex flex-col justify-between gap-8">
          <div className="flex flex-col lg:items-end">
            <h2 className="max-w-[22rem] text-[clamp(1.6rem,2.5vw,2.2rem)] leading-[1.2] text-cocoa lg:text-right">
              Join Our Community And Offline Store Sale
            </h2>
            <SeeMore to="/events" label="Learn more" className="mt-6" />
          </div>
          <img
            src={community2}
            alt="Inside the CircleUp thrift store"
            width={1104}
            height={1104}
            loading="lazy"
            className="aspect-[11/10] w-full rounded-[1.4rem] object-cover border border-foreground/15"
          />
        </div>
      </div>
    </section>
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

function Footer() {
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
          title="Community"
          links={[
            { label: 'The Social Circle', to: '/events' },
            { label: '#ThriftCrew', to: '/thrift-crew' },
            { label: 'Customer Reviews', to: '/reviews' },
            { label: 'Rental Collection', to: '/rentals' },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { label: 'About us', to: '/about' },
            { label: 'Contact', to: '/contact' },
            { label: 'Customer CRM', to: '/account' },
            { label: 'Owner CRM', to: '/admin' },
          ]}
        />
        <FooterCol
          title="Policies"
          links={[
            { label: 'Fixed Pricing & Returns', to: '/about' },
            { label: 'Rental Terms', to: '/rentals' },
            { label: 'WhatsApp Checkout', to: '/checkout/whatsapp' },
            { label: 'Privacy Policy', to: '/about' },
          ]}
        />
      </div>
    </footer>
  );
}

/**
 * CircleUp editorial landing page (ported from circleup-landing-page-main
 * with Forest Olive-Green & Warm Cream store signage color scheme).
 */
export function HomePage() {
  const mainRef = useRef<HTMLElement>(null);

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
            style={{
              backgroundImage: `url(${crumpledPaper})`,
            }}
          />
          <div aria-hidden className="paper-ambient-sheen" />

          <div className="relative z-20">
            <TopBanner />
            <Header />
            <main ref={mainRef} className="relative">
              <ScrollIvyBranch containerRef={mainRef} />
              <div className="relative z-20">
                <Hero />
                <ProductSection
                  id="ready-to-wear"
                  title="Ready-To-Wear"
                  products={readyToWear}
                  to="/shop/womens-upperwear"
                />
                <ProductSection
                  id="handbags"
                  title="Handbags Collection"
                  products={handbags}
                  to="/shop/accessories"
                />
                <StorySection />
                <WinterSection />
                <CommunitySection />
              </div>
            </main>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}

