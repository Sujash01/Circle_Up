import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { cn } from '@/lib/utils';
import { productService, type ProductSortOption } from '@/services/productService';
import type { ProductCategorySlug } from '@/types/storefront';

interface CategoryListingPageProps {
  categorySlug: ProductCategorySlug;
  aspectClass?: string;
}

/**
 * Minimal, photography-first editorial category page.
 * Keeps all category pieces directly visible without cluttered subcategory filters.
 */
export function CategoryListingPage({
  categorySlug,
  aspectClass = 'aspect-[4/5]',
}: CategoryListingPageProps) {
  const meta = productService.getCategoryMeta(categorySlug);
  const allInCategory = useMemo(
    () => productService.queryProducts({ category: categorySlug }),
    [categorySlug],
  );

  const [size, setSize] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sort, setSort] = useState<ProductSortOption>('newest');

  // Reset filters smoothly when navigating between category routes
  useEffect(() => {
    setSize('all');
    setInStockOnly(false);
    setSort('newest');
  }, [categorySlug]);

  const availableSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    for (const item of allInCategory) {
      for (const s of item.sizes) sizeSet.add(s);
    }
    return Array.from(sizeSet);
  }, [allInCategory]);

  const filteredProducts = useMemo(
    () =>
      productService.queryProducts({
        category: categorySlug,
        size,
        inStockOnly,
        sort,
      }),
    [categorySlug, size, inStockOnly, sort],
  );

  const resetFilters = () => {
    setSize('all');
    setInStockOnly(false);
    setSort('newest');
  };

  if (!meta) {
    return (
      <EmptyState
        title="Category unavailable"
        description="Explore our full curated thrift selection instead."
        actionLabel="Browse New Arrivals"
        actionTo="/new-arrivals"
      />
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Minimal Editorial Header */}
      <header className="space-y-3 border-b border-foreground/15 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-terracotta">
              Collection
            </p>
            <h1 className="mt-1 font-display text-3xl sm:text-4xl md:text-5xl text-cocoa tracking-tight">
              {meta.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-foreground/80">
              {meta.subtitle}
            </p>
          </div>

          <div className="text-xs uppercase tracking-wider text-terracotta/90 self-start sm:self-end whitespace-nowrap">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'curated piece' : 'curated pieces'}
          </div>
        </div>

        {/* Minimal inline controls toolbar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {availableSizes.length > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-card/60 px-3 py-1">
                <span className="text-[0.7rem] uppercase tracking-wider text-terracotta font-medium">Size:</span>
                <select
                  aria-label="Filter by size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="bg-transparent font-medium text-cocoa focus:outline-none cursor-pointer"
                >
                  <option value="all">All</option>
                  {availableSizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setInStockOnly((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors cursor-pointer text-xs',
                inStockOnly
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-foreground/20 bg-card/60 text-cocoa/80 hover:text-cocoa hover:border-foreground/35',
              )}
            >
              <span>Available pieces only</span>
            </button>

            {(size !== 'all' || inStockOnly) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-terracotta hover:text-primary underline underline-offset-4 ml-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label htmlFor="category-sort-select" className="text-xs text-terracotta uppercase tracking-wider font-medium">
              Sort:
            </label>
            <select
              id="category-sort-select"
              aria-label="Sort products"
              value={sort}
              onChange={(e) => setSort(e.target.value as ProductSortOption)}
              className="rounded-full border border-foreground/20 bg-card/60 px-3 py-1 text-xs sm:text-sm font-medium text-cocoa focus:border-primary focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>
      </header>

      {/* Photography-First Full-Width Product Grid */}
      <main>
        {filteredProducts.length === 0 ? (
          <EmptyState
            title="No pieces match your selection"
            description="Clear active filters to view all one-of-a-kind pieces in this category."
            actionLabel="View All Pieces"
            onAction={resetFilters}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-8 sm:gap-y-12">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                aspectClass={aspectClass}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
