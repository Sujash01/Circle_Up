import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import lookbook from '@/assets/lookbook.jpg';
import story2 from '@/assets/story-2.jpg';

const SUGGESTED_RAILS = [
  { label: 'New Arrivals', to: '/new-arrivals' },
  { label: "Women's Upperwear", to: '/womens-upperwear' },
  { label: "Women's One Piece", to: '/womens-one-piece' },
  { label: 'Rentals', to: '/rentals' },
  { label: 'Thrifted Treasure', to: '/thrifted-treasure' },
  { label: 'Handcrafted', to: '/handcrafted' },
  { label: '#ThriftCrew', to: '/thriftcrew' },
];

export function NotFoundPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/new-arrivals');
  };

  return (
    <div className="py-8 sm:py-12 space-y-12">
      {/* Main editorial 404 composition */}
      <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
        {/* Forest-Green & Cream double-border signage centerpiece */}
        <div className="bg-[#2f3e24] p-3 sm:p-4 shadow-xl">
          <div className="border-2 border-[#f8f4e2]/80 p-1">
            <div className="bg-[#f8f4e2] border border-[#2f3e24]/40 p-7 sm:p-10 space-y-6">
              <div className="flex items-center justify-between border-b border-foreground/15 pb-3 text-[0.7rem] uppercase tracking-[0.22em] text-terracotta">
                <span>Error 404</span>
                <span>CircleUp Archive</span>
              </div>

              <div>
                <p className="font-display text-6xl sm:text-7xl text-primary leading-none">404</p>
                <h1 className="mt-3 font-display text-3xl sm:text-4xl text-cocoa leading-tight">
                  Off the rack — this hanger is empty.
                </h1>
              </div>

              <p className="text-sm leading-relaxed text-foreground/85">
                The page or piece you looked for isn&apos;t here. It may have been thrifted by
                someone else, or the link has a typo. Search the rail or jump straight back into a
                collection below.
              </p>

              {/* Inline quick search */}
              <form onSubmit={handleSearch} className="flex gap-2 pt-1">
                <div className="relative flex-1">
                  <Search className="size-4 text-terracotta absolute left-0 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search denim, corsets, bags, crochet..."
                    className="w-full border-b-2 border-foreground/30 bg-transparent py-2 pl-6 text-sm text-cocoa placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
                >
                  Find
                </button>
              </form>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/"
                  className="bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
                >
                  Return Home
                </Link>
                <Link
                  to="/new-arrivals"
                  className="border border-foreground/30 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-cocoa hover:border-primary transition-colors"
                >
                  Browse Fresh Finds
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Right visual editorial pairing */}
        <div className="grid grid-cols-2 gap-4 items-center">
          <Link to="/new-arrivals" className="group block space-y-2">
            <div className="overflow-hidden bg-[#ece6d2]">
              <img
                src={lookbook}
                alt="Curated CircleUp flat-lay archive"
                className="aspect-[4/5] w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              />
            </div>
            <p className="text-xs font-medium text-cocoa group-hover:text-primary">
              Fresh Finds &amp; Lookbook →
            </p>
          </Link>

          <Link to="/mens-upperwear" className="group block space-y-2 mt-8">
            <div className="overflow-hidden bg-[#ece6d2]">
              <img
                src={story2}
                alt="Unisex vintage sweatshirts and denim"
                className="aspect-[4/5] w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              />
            </div>
            <p className="text-xs font-medium text-cocoa group-hover:text-primary">
              Unisex Vintage Rack →
            </p>
          </Link>
        </div>
      </section>

      {/* Suggested rails strip */}
      <section className="border-t border-foreground/15 pt-8 space-y-4">
        <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">
          Popular Rails to Explore
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {SUGGESTED_RAILS.map((rail) => (
            <Link
              key={rail.to}
              to={rail.to}
              className="border-b border-foreground/25 pb-0.5 text-cocoa hover:border-primary hover:text-primary transition-colors"
            >
              {rail.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
