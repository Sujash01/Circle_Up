import { Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { useStore } from '@/context/StoreContext';
import { formatInr } from '@/services/cartService';
import type { Product } from '@/types/storefront';

export function WishlistPage() {
  const { wishlistProducts, removeFromWishlist, addToCart } = useStore();
  const navigate = useNavigate();

  const handleMoveToBag = (product: Product) => {
    const inStockVariants = product.variants.filter((v) => v.stock > 0);
    if (inStockVariants.length === 1 && inStockVariants[0]) {
      const res = addToCart(product, inStockVariants[0], 1);
      if (res.ok) {
        removeFromWishlist(product.id);
      }
      return;
    }
    // If multiple sizes exist (or sold out), take user to select exact size on detail page
    navigate(`/product/${product.slug}`);
  };

  if (wishlistProducts.length === 0) {
    return (
      <EmptyState
        title="Your wishlist is empty"
        description="Save one-of-a-kind thrift finds while browsing so you can revisit or move them to your bag."
        actionLabel="Discover Fresh Finds"
        actionTo="/new-arrivals"
      />
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-foreground/15 pb-6">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-terracotta">Saved Rail</p>
          <h1 className="mt-2 font-display text-4xl text-cocoa">
            Wishlist ({wishlistProducts.length})
          </h1>
        </div>
        <Link to="/cart" className="text-xs font-semibold text-primary underline underline-offset-4">
          Go to Shopping Bag →
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
        {wishlistProducts.map((product) => {
          const singleStock = product.variants.filter((v) => v.stock > 0).length === 1;
          return (
            <article key={product.id} className="flex flex-col">
              <Link to={`/product/${product.slug}`} className="block overflow-hidden bg-[#ece6d2]">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="aspect-[4/5] w-full object-cover object-top hover:scale-[1.03] transition-transform duration-500"
                />
              </Link>

              <div className="mt-3 space-y-1 flex-1">
                <Link
                  to={`/product/${product.slug}`}
                  className="block text-sm font-medium text-cocoa hover:text-primary line-clamp-1"
                >
                  {product.name}
                </Link>
                <p className="text-sm font-bold text-primary tabular-nums">
                  {formatInr(product.price)}
                </p>
                <p className="text-xs text-terracotta">
                  {product.condition} · {product.availability}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  disabled={product.stock <= 0}
                  onClick={() => handleMoveToBag(product)}
                  className="flex-1 bg-primary py-2 text-[0.72rem] font-semibold uppercase tracking-wider text-primary-foreground hover:bg-forest-deep disabled:opacity-40"
                >
                  {product.stock <= 0
                    ? 'Sold Out'
                    : singleStock
                      ? 'Move to Bag'
                      : 'Select Size'}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${product.name} from wishlist`}
                  onClick={() => removeFromWishlist(product.id)}
                  className="border border-foreground/25 p-2 text-terracotta hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

