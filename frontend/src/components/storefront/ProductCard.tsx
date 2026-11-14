import { Heart } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/context/StoreContext';
import { Blob } from '@/components/ui/Blob';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/services/cartService';
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
  const tiltHash = Array.from(product.id).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
  const tilt = ((tiltHash % 5) - 2) * 0.22;

  return (
    <article
      className="product-tile group relative flex flex-col"
      style={{ '--card-tilt': `${tilt}deg` } as CSSProperties}
    >
      <Link
        to={`/product/${product.slug}`}
        className="product-image-frame relative block overflow-hidden bg-tile focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <Blob
          src={product.images[0]}
          alt={product.name}
          width={800}
          height={1000}
          shape="arch"
          className={cn('w-full', aspectClass)}
          imageClassName={cn(
            'product-tile-image object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]',
          )}
          onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
          onError={(event) => event.currentTarget.classList.add('is-loaded')}
        />

        {product.availability === 'Sold Out' && (
          <span className="absolute bottom-3 left-3 bg-footer/90 px-2.5 py-1 text-[0.68rem] uppercase tracking-widest text-footer-foreground">
            Sold Out
          </span>
        )}
      </Link>

      <button
        type="button"
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        onClick={() => toggleWishlist(product.id, product.name)}
        className={cn(
          'absolute top-3 right-3 z-10 flex size-[44px] items-center justify-center rounded-full bg-[#f8f4e2]/95 text-cocoa shadow-sm transition-opacity duration-200 hover:text-primary',
          saved
            ? 'opacity-100'
            : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
        )}
      >
        <Heart className={cn('size-4', saved && 'fill-primary text-primary')} strokeWidth={2} />
      </button>

      <div className="mt-3 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            to={`/product/${product.slug}`}
            className="inline-flex min-h-[44px] items-center text-[0.94rem] font-medium text-cocoa transition-colors group-hover:text-primary line-clamp-1"
          >
            {product.name}
          </Link>
          <span className="text-[0.9rem] font-semibold text-destructive tabular-nums shrink-0">
            {formatPrice(product.price)}
          </span>
        </div>

        <p className="text-[0.74rem] text-terracotta">
          <span className="font-mono text-[0.68rem] text-cocoa/70 font-semibold">{product.serialNumber || product.id.toUpperCase()}</span>
          {' · '}
          {showSubcategory ? `${product.subcategory} · ` : ''}
          {product.condition}
          {product.stock === 1 ? ' · Only 1 piece' : ''}
        </p>
      </div>
    </article>
  );
}

