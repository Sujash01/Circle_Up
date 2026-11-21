import { Link } from 'react-router-dom';
import heroStoreRack from '@/assets/hero-store-rack.jpg';
import heroStoreCounter from '@/assets/hero-store-counter.jpg';
import heroStoreLamp from '@/assets/hero-store-lamp.jpg';
import bag1 from '@/assets/bag-1.jpg';

export function AboutPage() {
  return (
    <div className="space-y-16 sm:space-y-24 max-w-6xl mx-auto pb-12">
      {/* 1. Opening Statement */}
      <header className="border-b border-foreground/15 pb-12 space-y-5">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.24em] text-terracotta">
          About CircleUp
        </p>
        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-cocoa leading-[1.04] tracking-tight">
          So, what’s CircleUp?
        </h1>
        <p className="font-display text-2xl sm:text-3xl lg:text-4xl text-steel font-normal leading-snug max-w-3xl pt-2">
          We’re a little bit thrift store, a little bit treasure hunt.
        </p>
      </header>

      {/* 2. Handpicked Pre-Loved & Brand New Story Split */}
      <section className="grid gap-10 lg:grid-cols-2 items-center">
        <div className="relative overflow-hidden rounded-2xl bg-card shadow-soft">
          <img
            src={heroStoreRack}
            alt="Curated clothing rails and jackets hanging inside CircleUp studio"
            width={764}
            height={912}
            className="aspect-[4/4.6] w-full object-cover"
          />
        </div>

        <div className="space-y-6 lg:pl-6">
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-terracotta">
            The Curation
          </span>
          <h2 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight">
            Handpicked pre-loved, brand-new pieces &amp; interesting finds.
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-foreground/85">
            At CircleUp, you’ll find handpicked pre-loved clothing, brand-new pieces, jewellery,
            accessories and all sorts of interesting finds.
          </p>
          <p className="text-sm sm:text-base leading-relaxed text-foreground/75">
            From classic leather jackets and timeless denim to unworn artisan co-ords, upcycled crafts,
            and statement bags, each piece is selected with an eye for quality, timelessness, and
            character.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/thrifted"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:text-forest-deep transition-colors"
            >
              <span>Explore Thrifted Rail</span>
              <span aria-hidden="true">→</span>
            </Link>
            <span className="text-foreground/20" aria-hidden="true">|</span>
            <Link
              to="/brand-new"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cocoa hover:text-primary transition-colors"
            >
              <span>Explore Brand New</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 3. Our Philosophy & Thoughtful Shopping */}
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center border-t border-foreground/15 pt-16">
        <div className="space-y-6">
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-terracotta">
            Our Philosophy
          </span>
          <h2 className="font-display text-3xl sm:text-4xl text-steel leading-tight">
            Thoughtful shopping, and a lot more fun.
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-foreground/85">
            We love giving good things another chance, discovering new favourites and making
            shopping a little more thoughtful (and a lot more fun).
          </p>
          <p className="text-base sm:text-lg leading-relaxed text-foreground/85">
            No two visits have to look the same. There’s always something new to stumble upon.
          </p>
          <div className="pt-2">
            <div className="flex items-center gap-4">
              <span className="size-2 rounded-full bg-primary" />
              <p className="font-script text-xl sm:text-2xl text-terracotta">
                Every piece waiting for its rightful next home.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
            <img
              src={heroStoreCounter}
              alt="CircleUp checkout desk with vinyl records and studio tablet"
              width={377}
              height={348}
              className="aspect-square w-full object-cover"
            />
          </div>
          <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
            <img
              src={heroStoreLamp}
              alt="Warm straw hat pendant lamp in the CircleUp shop window"
              width={379}
              height={315}
              className="aspect-square w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 4. Four Editorial Columns without Heavy SaaS Boxes */}
      <section className="border-y border-foreground/15 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <h3 className="font-display text-xl text-cocoa">Pre-Loved Clothing</h3>
            <p className="text-xs sm:text-sm leading-relaxed text-foreground/80">
              Cleaned, graded, and inspected archive jackets, denim, sweaters, and everyday co-ords
              ready for their second act.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-xl text-cocoa">Brand-New Pieces</h3>
            <p className="text-xs sm:text-sm leading-relaxed text-foreground/80">
              Fresh contemporary arrivals, unworn studio crafts, and mint tag pieces from independent
              makers.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-xl text-cocoa">Jewellery &amp; Accessories</h3>
            <p className="text-xs sm:text-sm leading-relaxed text-foreground/80">
              Structured handbags, crossbody slings, handcrafted belts, and small treasures that complete
              any look.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-xl text-cocoa">Ever-Changing Rails</h3>
            <p className="text-xs sm:text-sm leading-relaxed text-foreground/80">
              Constantly refreshed drops so that no two visits ever feel the same. A real treasure
              hunt every time.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Closing Invitation & Signature CTA */}
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center pt-4">
        <div className="space-y-6">
          <p className="font-script text-3xl sm:text-4xl lg:text-5xl text-terracotta leading-tight">
            Come for a look. Leave with a find.
          </p>
          <p className="text-sm sm:text-base leading-relaxed text-foreground/80 max-w-lg">
            Whether you are stopping by to browse pre-loved treasures, pick up an unworn studio piece,
            or simply hang out at our community gatherings, there is always something worth taking home.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/new-arrivals"
              className="inline-flex min-h-[46px] items-center justify-center rounded-full bg-primary px-7 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-all shadow-soft"
            >
              Browse Fresh Finds →
            </Link>
            <Link
              to="/events"
              className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-foreground/25 bg-card px-7 py-2.5 text-xs font-bold uppercase tracking-widest text-cocoa hover:border-primary hover:text-primary transition-all"
            >
              The Social Circle
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <img
            src={bag1}
            alt="Curated accessories and textured bags at CircleUp"
            width={1008}
            height={1008}
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
      </section>
    </div>
  );
}
