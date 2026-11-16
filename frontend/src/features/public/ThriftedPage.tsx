import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { cn } from '@/lib/utils';
import { productService, type ProductSortOption } from '@/services/productService';
import type { ProductCategorySlug } from '@/types/storefront';

export function ThriftedPage() {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategorySlug | 'all'>('all');
  const [sort, setSort] = useState<ProductSortOption>('newest');

  const products = useMemo(
    () =>
      productService.getThriftedProducts({
        category: selectedCategory,
        sort,
      }),
    [selectedCategory, sort],
  );

  const categories = productService.getCategories();

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-foreground/15 pb-6">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-terracotta">
            Pre-Loved, Archival &amp; Vintage Rails
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">Curated Thrifted</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/80">
            One-of-a-kind vintage apparel, gently loved wardrobe staples, estate treasures, and pre-loved classics given a second life.
          </p>
        </div>

        <div className="flex items-center gap-4 self-start md:self-auto">
          <span className="text-xs text-terracotta uppercase tracking-wider font-medium">
            {products.length} {products.length === 1 ? 'piece' : 'pieces'}
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="thrifted-sort" className="text-xs uppercase tracking-wider text-terracotta">
              Sort
            </label>
            <select
              id="thrifted-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as ProductSortOption)}
              className="border-b border-foreground/30 bg-transparent py-1.5 pr-4 text-sm font-medium text-cocoa focus:border-primary focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>
      </header>

      {/* Editorial Category Filter Chips */}
      <nav aria-label="Filter thrifted finds by category" className="flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={cn(
            'pb-1 transition-colors border-b-2 cursor-pointer',
            selectedCategory === 'all'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-terracotta hover:text-cocoa',
          )}
        >
          All Thrifted
        </button>
        {categories.map((cat) => (
          <button
            key={cat.slug}
            type="button"
            onClick={() => setSelectedCategory(cat.slug)}
            className={cn(
              'pb-1 transition-colors border-b-2 cursor-pointer',
              selectedCategory === cat.slug
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-terracotta hover:text-cocoa',
            )}
          >
            {cat.title}
          </button>
        ))}
      </nav>

      {/* Grid or Empty State */}
      {products.length === 0 ? (
        <EmptyState
          title="No thrifted pieces found in this category"
          description="Try selecting 'All Thrifted' or check back as we curate estate trunks weekly."
          actionLabel="Browse Brand New Finds"
          actionTo="/brand-new"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-8 sm:gap-y-12">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
