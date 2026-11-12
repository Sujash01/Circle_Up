import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { cn } from '@/lib/utils';
import { productService, type ProductSortOption } from '@/services/productService';
import type { GenderTag } from '@/types/storefront';

export function JewelleryPage() {
  const meta = productService.getCategoryMeta('jewellery')!;
  const [subcategory, setSubcategory] = useState<string>('all');
  const [gender, setGender] = useState<GenderTag | 'all'>('all');
  const [sort, setSort] = useState<ProductSortOption>('newest');

  const products = useMemo(
    () =>
      productService.queryProducts({
        category: 'jewellery',
        subcategory,
        gender,
        sort,
      }),
    [subcategory, gender, sort],
  );

  return (
    <div className="space-y-12">
      <header className="text-center max-w-2xl mx-auto space-y-3 pt-2">
        <p className="text-[0.72rem] uppercase tracking-[0.24em] text-terracotta">
          Small Details &amp; Heirloom Metals
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-cocoa">{meta.title}</h1>
        <p className="text-sm text-foreground/80">{meta.subtitle}</p>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-y border-foreground/15 py-4">
        <nav aria-label="Jewellery categories" className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setSubcategory('all')}
            className={cn(
              'pb-0.5 border-b',
              subcategory === 'all'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-terracotta hover:text-cocoa',
            )}
          >
            All
          </button>
          {meta.subcategories.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSubcategory(sub)}
              className={cn(
                'pb-0.5 border-b',
                subcategory === sub
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-terracotta hover:text-cocoa',
              )}
            >
              {sub}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4 text-xs">
          <select
            aria-label="Filter by audience"
            value={gender}
            onChange={(e) => setGender(e.target.value as GenderTag | 'all')}
            className="border-b border-foreground/25 bg-transparent py-1 text-cocoa focus:outline-none"
          >
            <option value="all">Women &amp; Unisex</option>
            <option value="Women">Women</option>
            <option value="Unisex">Unisex</option>
          </select>

          <select
            aria-label="Sort jewellery"
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSortOption)}
            className="border-b border-foreground/25 bg-transparent py-1 text-cocoa focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No jewellery pieces match that filter"
          description="Clear the filter to see all rings, bracelets, necklaces, earrings, chains, and hair pieces."
          actionLabel="Show All Jewellery"
          onAction={() => {
            setSubcategory('all');
            setGender('all');
          }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} aspectClass="aspect-square" />
          ))}
        </div>
      )}
    </div>
  );
}

