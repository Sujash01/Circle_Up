import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '@/context/StoreContext';
import { cn } from '@/lib/utils';
import { formatInr } from '@/services/cartService';
import type { Product } from '@/types/storefront';

interface ProductCardProps {
  product: Product;
  aspectClass?: string;
  showSubcategory?: boolean;
}

/**
 * Editorial photography-first product tile without heavy box or pill clutter.
 */
export function ProductCard({
  product,
  aspectClass = 'aspect-[4/5]',
  showSubcategory = true,
}: ProductCardProps) {
  const { isWishlisted, toggleWishlist } = useStore();
  const saved = isWishlisted(product.id);

  return (
    <article className="group relative flex flex-col">
      <Link to={`/product/${product.slug}`} className="block relative overflow-hidden bg-[#ece6d2]">
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          className={cn(
            'w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]',
            aspectClass,
          )}
        />

        <button
          type="button"
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.id, product.name);
          }}
          className={cn(
            'absolute top-3 right-3 z-10 flex size-9 items-center justify-center bg-[#f8f4e2]/90 text-cocoa transition-opacity duration-200 hover:text-primary',
            saved ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Heart className={cn('size-4', saved && 'fill-primary text-primary')} strokeWidth={2} />
        </button>

        {product.availability === 'Sold Out' && (
          <span className="absolute bottom-3 left-3 bg-footer/90 px-2.5 py-1 text-[0.68rem] uppercase tracking-widest text-footer-foreground">
            Sold Out
          </span>
        )}
      </Link>

      <div className="mt-3 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            to={`/product/${product.slug}`}
            className="text-[0.94rem] font-medium text-cocoa transition-colors group-hover:text-primary line-clamp-1"
          >
            {product.name}
          </Link>
          <span className="text-[0.9rem] font-semibold text-primary tabular-nums shrink-0">
            {formatInr(product.price)}
          </span>
        </div>

        <p className="text-[0.74rem] text-terracotta">
          {showSubcategory ? `${product.subcategory} · ` : ''}
          {product.condition}
          {product.stock === 1 ? ' · Only 1 piece' : ''}
        </p>
      </div>
    </article>
  );
}

