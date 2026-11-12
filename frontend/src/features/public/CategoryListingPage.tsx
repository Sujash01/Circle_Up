import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { cn } from '@/lib/utils';
import { productService, type ProductSortOption } from '@/services/productService';
import type { GenderTag, ProductCategorySlug, ProductCondition } from '@/types/storefront';

interface CategoryListingPageProps {
  categorySlug: ProductCategorySlug;
  aspectClass?: string;
}

const CONDITIONS: Array<ProductCondition | 'all'> = [
  'all',
  'New With Tags',
  'Mint',
  'Gently Used',
  'Vintage Wear',
  'Artisan Made',
];

/**
 * Reusable editorial category catalog supporting subcategories, sizes,
 * condition, gender/unisex, price ceiling, and sorting.
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

  const [subcategory, setSubcategory] = useState<string>('all');
  const [size, setSize] = useState<string>('all');
  const [condition, setCondition] = useState<ProductCondition | 'all'>('all');
  const [gender, setGender] = useState<GenderTag | 'all'>('all');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sort, setSort] = useState<ProductSortOption>('newest');

  // Reset filters smoothly when navigating between category routes.
  useEffect(() => {
    setSubcategory('all');
    setSize('all');
    setCondition('all');
    setGender('all');
    setMaxPrice('');
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
        subcategory,
        size,
        condition,
        gender,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        inStockOnly,
        sort,
      }),
    [categorySlug, subcategory, size, condition, gender, maxPrice, inStockOnly, sort],
  );

  const resetAll = () => {
    setSubcategory('all');
    setSize('all');
    setCondition('all');
    setGender('all');
    setMaxPrice('');
    setInStockOnly(false);
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
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-foreground/15 pb-6">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">Collection</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">{meta.title}</h1>
          <p className="mt-2 max-w-xl text-sm text-foreground/80">{meta.subtitle}</p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-terracotta">{filteredProducts.length} pieces</span>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSortOption)}
            className="border-b border-foreground/30 bg-transparent py-1.5 pr-3 text-sm font-medium text-cocoa focus:border-primary focus:outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        {/* Unobtrusive typographic filter column */}
        <aside className="space-y-6 text-sm">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2.5">
              Subcategory
            </p>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => setSubcategory('all')}
                  className={cn(
                    'text-left transition-colors',
                    subcategory === 'all'
                      ? 'font-semibold text-primary underline underline-offset-4'
                      : 'text-cocoa/80 hover:text-primary',
                  )}
                >
                  All
                </button>
              </li>
              {meta.subcategories.map((sub) => (
                <li key={sub}>
                  <button
                    type="button"
                    onClick={() => setSubcategory(sub)}
                    className={cn(
                      'text-left transition-colors',
                      subcategory === sub
                        ? 'font-semibold text-primary underline underline-offset-4'
                        : 'text-cocoa/80 hover:text-primary',
                    )}
                  >
                    {sub}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {meta.supportsGenderFilter && (
            <div>
              <label
                htmlFor="filter-gender"
                className="block text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2"
              >
                Fit / Audience
              </label>
              <select
                id="filter-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderTag | 'all')}
                className="w-full border-b border-foreground/25 bg-transparent py-1.5 text-sm text-cocoa focus:border-primary focus:outline-none"
              >
                <option value="all">All (incl. Unisex)</option>
                <option value="Women">Women &amp; Unisex</option>
                <option value="Men">Men &amp; Unisex</option>
                <option value="Unisex">Unisex Only</option>
              </select>
            </div>
          )}

          {availableSizes.length > 0 && (
            <div>
              <label
                htmlFor="filter-size"
                className="block text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2"
              >
                Size
              </label>
              <select
                id="filter-size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full border-b border-foreground/25 bg-transparent py-1.5 text-sm text-cocoa focus:border-primary focus:outline-none"
              >
                <option value="all">All Sizes</option>
                {availableSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="filter-condition"
              className="block text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2"
            >
              Condition
            </label>
            <select
              id="filter-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as ProductCondition | 'all')}
              className="w-full border-b border-foreground/25 bg-transparent py-1.5 text-sm text-cocoa focus:border-primary focus:outline-none"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'Any Condition' : c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-max-price"
              className="block text-[0.7rem] font-bold uppercase tracking-[0.18em] text-terracotta mb-2"
            >
              Max Price (INR)
            </label>
            <input
              id="filter-max-price"
              type="number"
              min={0}
              step={100}
              placeholder="e.g. 2500"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full border-b border-foreground/25 bg-transparent py-1.5 text-sm text-cocoa placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-cocoa cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="accent-primary"
            />
            <span>Available pieces only</span>
          </label>

          <button
            type="button"
            onClick={resetAll}
            className="text-xs underline underline-offset-4 text-terracotta hover:text-primary"
          >
            Reset filters
          </button>
        </aside>

        {/* Photography-led Product Grid */}
        <div>
          {filteredProducts.length === 0 ? (
            <EmptyState
              title="No matching pieces found"
              description="Adjust or clear your filters to browse every curated item in this collection."
              actionLabel="Reset Filters"
              onAction={resetAll}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-10">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  aspectClass={aspectClass}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

