import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { productService, type ProductSortOption } from '@/services/productService';

export function ThriftedTreasurePage() {
  const meta = productService.getCategoryMeta('thrifted-treasure')!;
  const [sort, setSort] = useState<ProductSortOption>('newest');

  // Show dedicated Thrifted Treasure items plus small one-of-a-kind tagged finds
  const treasures = useMemo(() => {
    const base = productService.queryProducts({
      category: 'thrifted-treasure',
      sort,
    });
    const smallFinds = productService
      .getAllProducts()
      .filter(
        (p) =>
          p.category !== 'thrifted-treasure' &&
          (p.tags.includes('treasure') || p.tags.includes('one-of-a-kind')),
      );
    return [...base, ...smallFinds];
  }, [sort]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-foreground/15 pb-6">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-terracotta">
            Small Finds &amp; One-Offs
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl md:text-5xl text-cocoa tracking-tight">
            {meta.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-foreground/80">
            {meta.subtitle} Each piece is tucked away from estate trunks, archival rails, and studio curations.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-end">
          <span className="text-xs text-terracotta uppercase tracking-wider font-medium">
            {treasures.length} pieces
          </span>
          <select
            aria-label="Sort thrifted treasures"
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSortOption)}
            className="rounded-full border border-foreground/20 bg-card/60 px-3 py-1 text-xs sm:text-sm font-medium text-cocoa focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </header>

      {treasures.length === 0 ? (
        <EmptyState
          title="No treasures found"
          description="Check back soon as we archive new unique finds weekly."
          actionLabel="Browse New Arrivals"
          actionTo="/new-arrivals"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-8 sm:gap-y-12">
          {treasures.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
