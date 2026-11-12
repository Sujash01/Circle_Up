import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { cn } from '@/lib/utils';
import { formatInr } from '@/services/cartService';
import { productService, type ProductSortOption } from '@/services/productService';
import type { ProductCategorySlug } from '@/types/storefront';

export function NewArrivalsPage() {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategorySlug | 'all'>('all');
  const [sort, setSort] = useState<ProductSortOption>('newest');

  const categories = productService.getCategories();
  const products = useMemo(
    () =>
      productService.queryProducts({
        newArrivalsOnly: true,
        category: selectedCategory,
        sort,
      }),
    [selectedCategory, sort],
  );

  const spotlight = products[0];
  const rest = selectedCategory === 'all' && sort === 'newest' ? products.slice(1) : products;

  return (
    <div className="space-y-12">
      {/* Editorial Intro */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-foreground/15 pb-6">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-terracotta">
            New Arrivals
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">Fresh Finds</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/80">
            Recently steamed, measured, and added to the CircleUp rail — sorted newest first.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <label htmlFor="new-arrivals-sort" className="text-xs uppercase tracking-wider text-terracotta">
            Sort
          </label>
          <select
            id="new-arrivals-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSortOption)}
            className="border-b border-foreground/30 bg-transparent py-1.5 pr-4 text-sm font-medium text-cocoa focus:border-primary focus:outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </header>

      {/* Unobtrusive editorial underline category filter */}
      <nav aria-label="Filter new arrivals by category" className="flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={cn(
            'pb-1 transition-colors border-b-2',
            selectedCategory === 'all'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-terracotta hover:text-cocoa',
          )}
        >
          All Fresh Finds
        </button>
        {categories.map((cat) => (
          <button
            key={cat.slug}
            type="button"
            onClick={() => setSelectedCategory(cat.slug)}
            className={cn(
              'pb-1 transition-colors border-b-2',
              selectedCategory === cat.slug
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-terracotta hover:text-cocoa',
            )}
          >
            {cat.title}
          </button>
        ))}
      </nav>

      {/* Lead editorial spotlight (only on default view) */}
      {spotlight && selectedCategory === 'all' && sort === 'newest' && (
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center pb-8 border-b border-foreground/15">
          <Link to={`/product/${spotlight.slug}`} className="block overflow-hidden bg-[#ece6d2]">
            <img
              src={spotlight.images[0]}
              alt={spotlight.name}
              className="aspect-[4/4.2] w-full object-cover object-top hover:scale-[1.02] transition-transform duration-700"
            />
          </Link>
          <div className="lg:pl-6 space-y-4">
            <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">
              Latest Drop · {spotlight.categoryLabel}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight">
              {spotlight.name}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/85">{spotlight.description}</p>
            <div className="pt-2 flex flex-wrap items-center gap-6">
              <span className="text-xl font-bold text-primary tabular-nums">
                {formatInr(spotlight.price)}
              </span>
              <span className="text-xs text-terracotta">
                Condition: {spotlight.condition} · Sizes: {spotlight.sizes.join(', ')}
              </span>
            </div>
            <div className="pt-3">
              <Link
                to={`/product/${spotlight.slug}`}
                className="inline-block bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
              >
                Inspect Piece
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Remaining grid */}
      {products.length === 0 ? (
        <EmptyState
          title="No new arrivals in this category yet"
          description="Try selecting another category or reset your filter to explore all fresh finds."
          actionLabel="View All New Arrivals"
          onAction={() => setSelectedCategory('all')}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
          {rest.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

