import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { productService, type ProductSortOption } from '@/services/productService';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as ProductSortOption) || 'newest';

  const results = useMemo(
    () => productService.queryProducts({ search: query, sort }),
    [query, sort],
  );

  const updateQuery = (nextQ: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextQ) next.set('q', nextQ);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const updateSort = (nextSort: ProductSortOption) => {
    const next = new URLSearchParams(searchParams);
    next.set('sort', nextSort);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-10">
      <header className="space-y-4 border-b border-foreground/15 pb-6">
        <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">Catalog Search</p>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <input
            type="search"
            aria-label="Search products"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="Search by piece name, category, or subcategory..."
            className="flex-1 border-b-2 border-foreground/30 bg-transparent py-2 font-display text-2xl sm:text-3xl text-cocoa placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />

          <select
            aria-label="Sort search results"
            value={sort}
            onChange={(e) => updateSort(e.target.value as ProductSortOption)}
            className="border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
        <p className="text-xs text-terracotta">
          {results.length} matching piece{results.length === 1 ? '' : 's'}
          {query.trim() ? ` for "${query.trim()}"` : ''}
        </p>
      </header>

      {results.length === 0 ? (
        <EmptyState
          title={`No pieces matched "${query}"`}
          description="Try searching for denim, corset, bag, scarf, jewellery, crochet, or browse all New Arrivals."
          actionLabel="Explore New Arrivals"
          actionTo="/new-arrivals"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

