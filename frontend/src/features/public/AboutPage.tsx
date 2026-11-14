import { Link } from 'react-router-dom';
import community2 from '@/assets/community-1.webp';
import story1 from '@/assets/story-1.jpg';
import story2 from '@/assets/story-2.jpg';

export function AboutPage() {
  return (
    <div className="space-y-16">
      {/* Opening statement */}
      <header className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-end border-b border-foreground/15 pb-10">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">About CircleUp</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl text-cocoa leading-[1.08]">
            Every thrifted piece carries a story — we give it a next chapter.
          </h1>
        </div>
        <p className="text-sm leading-relaxed text-foreground/85">
          CircleUp is an independent thrift-fashion platform bringing together curated pre-loved
          clothing, archival accessories, rentable occasion pieces, handcrafted maker finds, and a
          shared community space.
        </p>
      </header>

      {/* Editorial story split */}
      <section className="grid gap-10 lg:grid-cols-2 items-center">
        <div className="overflow-hidden bg-[#ece6d2]">
          <img
            src={story1}
            alt="Curated vintage plaid halter top and relaxed denim"
            className="aspect-[4/4.5] w-full object-cover object-top"
          />
        </div>

        <div className="space-y-6 lg:pl-6">
          <h2 className="font-display text-3xl text-steel">Fashion That Lasts</h2>
          <p className="text-sm leading-[1.9] text-foreground/85">
            Instead of letting well-made garments sit forgotten at the back of a wardrobe, CircleUp
            focuses on reuse, careful curation, and transparent condition grading. From one-of-a-kind
            denim and knitwear to small-batch handcrafted pieces, each item is selected for
            longevity and character.
          </p>
          <p className="text-sm leading-[1.9] text-foreground/85">
            Alongside buying pre-loved, our Rental Rail encourages borrowing statement pieces when
            you only need them for a weekend, shoot, or celebration — keeping clothes in active
            circulation rather than idle storage.
          </p>
        </div>
      </section>

      {/* Three editorial pillars without SaaS boxes */}
      <section className="grid gap-10 md:grid-cols-3 border-y border-foreground/15 py-10">
        <div className="space-y-2">
          <h3 className="font-display text-xl text-cocoa">Pre-Loved &amp; Curated</h3>
          <p className="text-sm leading-relaxed text-foreground/80">
            Handpicked clothing, footwear, jewellery, and smaller thrifted treasures inspected and
            listed with straightforward condition notes.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl text-cocoa">Reuse &amp; Sustainability</h3>
          <p className="text-sm leading-relaxed text-foreground/80">
            Extending the active life of existing textiles, paired with sustainable packaging across
            orders and low-waste studio repair events.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl text-cocoa">Community-Driven</h3>
          <p className="text-sm leading-relaxed text-foreground/80">
            Through <em>The Social Circle</em> offline gatherings and <em>#ThriftCrew</em> style
            shares, CircleUp is shaped by the people who wear and swap the pieces.
          </p>
        </div>
      </section>

      {/* Closing image & CTAs */}
      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="space-y-5">
          <h2 className="font-display text-3xl text-cocoa">Explore the Store &amp; Community</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            Browse newly added thrift finds, check out community events, or share a look with the
            #ThriftCrew gallery.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/new-arrivals"
              className="bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
            >
              Browse Fresh Finds
            </Link>
            <Link
              to="/events"
              className="border border-foreground/30 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-cocoa hover:border-primary transition-colors"
            >
              The Social Circle
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <img
            src={story2}
            alt="Curated vintage sweatshirts and patched denim"
            className="aspect-[4/5] w-full object-cover"
          />
          <img
            src={community2}
            alt="Inside the CircleUp thrift store"
            className="aspect-[4/5] w-full object-cover"
          />
        </div>
      </section>
    </div>
  );
}

