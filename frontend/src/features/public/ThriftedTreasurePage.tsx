import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { cn } from '@/lib/utils';
import { productService, type ProductSortOption } from '@/services/productService';

export function ThriftedTreasurePage() {
  const meta = productService.getCategoryMeta('thrifted-treasure')!;
  const [subcategory, setSubcategory] = useState<string>('all');
  const [sort, setSort] = useState<ProductSortOption>('newest');

  // Show dedicated Thrifted Treasure items plus small one-of-a-kind tagged finds
  const treasures = useMemo(() => {
    const base = productService.queryProducts({
      category: 'thrifted-treasure',
      subcategory,
      sort,
    });
    if (subcategory !== 'all') return base;
    const smallFinds = productService
      .getAllProducts()
      .filter(
        (p) =>
          p.category !== 'thrifted-treasure' &&
          (p.tags.includes('treasure') || p.tags.includes('one-of-a-kind')),
      );
    return [...base, ...smallFinds];
  }, [subcategory, sort]);

  return (
    <div className="space-y-12">
      <header className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] items-end border-b border-foreground/15 pb-7">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">
            Small Finds &amp; One-Offs
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">{meta.title}</h1>
        </div>
        <p className="text-sm leading-relaxed text-foreground/80">
          {meta.subtitle} Each piece is tucked away from estate trunks, archival rails, and studio
          curations.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-sm">
          {['all', ...meta.subcategories].map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSubcategory(sub)}
              className={cn(
                'pb-1 border-b',
                subcategory === sub
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-terracotta hover:text-cocoa',
              )}
            >
              {sub === 'all' ? 'All Small Finds' : sub}
            </button>
          ))}
        </div>

        <select
          aria-label="Sort thrifted treasures"
          value={sort}
          onChange={(e) => setSort(e.target.value as ProductSortOption)}
          className="border-b border-foreground/25 bg-transparent py-1 text-sm text-cocoa focus:outline-none"
        >
          <option value="newest">Newest First</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </div>

      {treasures.length === 0 ? (
        <EmptyState
          title="No treasures in that drawer right now"
          description="Reset the filter to explore all curated small finds."
          actionLabel="Show All Finds"
          onAction={() => setSubcategory('all')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-7 gap-y-12">
          {treasures.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              aspectClass={index % 3 === 1 ? 'aspect-square' : 'aspect-[4/5]'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

