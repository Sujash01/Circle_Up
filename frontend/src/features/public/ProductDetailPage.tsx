import { Heart, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { useStore } from '@/context/StoreContext';
import { cn } from '@/lib/utils';
import { formatInr } from '@/services/cartService';
import { productService } from '@/services/productService';

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  const product = productService.getProductBySlug(slug);
  const { addToCart, isWishlisted, toggleWishlist } = useStore();

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [validationError, setValidationError] = useState<string>('');
  const [addedFeedback, setAddedFeedback] = useState(false);

  useEffect(() => {
    setActiveImageIdx(0);
    setQuantity(1);
    setValidationError('');
    setAddedFeedback(false);
    const firstVariant = product?.variants[0];
    if (product && product.variants.length === 1 && firstVariant && firstVariant.stock > 0) {
      setSelectedVariantId(firstVariant.id);
    } else {
      setSelectedVariantId('');
    }
  }, [slug, product]);

  if (!product) {
    return (
      <EmptyState
        title="This piece could not be found"
        description="It may have moved or the URL slug is mistyped. Explore freshly curated pieces instead."
        actionLabel="Browse New Arrivals"
        actionTo="/new-arrivals"
      />
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const activePrice = selectedVariant?.priceOverride ?? product.price;
  const maxStock = selectedVariant ? selectedVariant.stock : product.stock;
  const saved = isWishlisted(product.id);
  const related = productService.getRelatedProducts(product, 4);

  const handleAddToBag = () => {
    if (!selectedVariant) {
      setValidationError('Please select an available size or option before adding to bag.');
      return;
    }
    if (selectedVariant.stock <= 0) {
      setValidationError('This size/option is currently out of stock.');
      return;
    }

    setValidationError('');
    const result = addToCart(product, selectedVariant, quantity);
    if (!result.ok && result.error) {
      setValidationError(result.error);
      return;
    }
    setAddedFeedback(true);
  };

  return (
    <div className="space-y-16">
      {/* Breadcrumb navigation */}
      <nav aria-label="Breadcrumb" className="text-xs text-terracotta flex flex-wrap items-center gap-2">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <Link to={`/${product.category}`} className="hover:text-primary">
          {product.categoryLabel}
        </Link>
        <span>/</span>
        <span className="text-cocoa font-medium">{product.name}</span>
      </nav>

      {/* Main image-led split */}
      <section className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] items-start">
        {/* Image gallery */}
        <div className="space-y-4">
          <div className="overflow-hidden bg-[#ece6d2]">
            <img
              src={product.images[activeImageIdx] ?? product.images[0]}
              alt={`${product.name} view ${activeImageIdx + 1}`}
              className="aspect-[4/4.6] w-full object-cover object-top"
            />
          </div>

          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {product.images.map((imgSrc, idx) => (
                <button
                  key={`${product.id}-thumb-${idx}`}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  aria-label={`View image ${idx + 1}`}
                  className={cn(
                    'w-20 shrink-0 overflow-hidden border-2 transition-opacity',
                    activeImageIdx === idx
                      ? 'border-primary opacity-100'
                      : 'border-transparent opacity-65 hover:opacity-100',
                  )}
                >
                  <img src={imgSrc} alt="" className="aspect-[4/5] w-full object-cover object-top" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product storytelling & controls */}
        <div className="lg:pl-4 space-y-6">
          <div className="space-y-2 border-b border-foreground/15 pb-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-terracotta">
                {product.categoryLabel} · {product.subcategory}
              </p>
              <span className="font-mono text-[0.7rem] bg-secondary px-2 py-0.5 text-cocoa font-medium tracking-wide border border-foreground/10">
                SERIAL: {product.serialNumber || product.id.toUpperCase()}
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight">
              {product.name}
            </h1>

            <div className="pt-2 flex items-baseline gap-4">
              <span className="text-2xl font-bold text-primary tabular-nums">
                {formatInr(activePrice)}
              </span>
              {product.originalPrice && product.originalPrice > activePrice && (
                <span className="text-sm text-muted-foreground line-through tabular-nums">
                  {formatInr(product.originalPrice)}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground/85">{product.description}</p>

          <dl className="grid grid-cols-2 gap-y-2 text-xs border-y border-foreground/15 py-4">
            <dt className="uppercase tracking-wider text-terracotta">Item Serial No.</dt>
            <dd className="font-mono font-medium text-cocoa">{product.serialNumber || product.id.toUpperCase()}</dd>

            <dt className="uppercase tracking-wider text-terracotta">Condition</dt>
            <dd className="font-medium text-cocoa">{product.condition}</dd>

            <dt className="uppercase tracking-wider text-terracotta">Availability</dt>
            <dd className="font-medium text-cocoa">
              {product.stock > 0
                ? `${product.availability} (${product.stock} total left)`
                : 'Sold Out'}
            </dd>

            {product.measurements && (
              <>
                <dt className="uppercase tracking-wider text-terracotta">Measurements</dt>
                <dd className="font-medium text-cocoa">{product.measurements}</dd>
              </>
            )}

            <dt className="uppercase tracking-wider text-terracotta">Curation</dt>
            <dd className="font-medium text-cocoa">{product.productType}</dd>
          </dl>

          {product.makerNote && (
            <p className="border-l-2 border-primary pl-4 text-xs italic text-steel">
              {product.makerNote}
            </p>
          )}

          {/* Size / Variant selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-cocoa">
                Select Size / Option
              </span>
              {selectedVariant && (
                <span className="text-terracotta">
                  {selectedVariant.stock} available in {selectedVariant.label}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              {product.variants.map((variant) => {
                const isSelected = variant.id === selectedVariantId;
                const soldOut = variant.stock <= 0;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => {
                      setSelectedVariantId(variant.id);
                      setQuantity(1);
                      setValidationError('');
                      setAddedFeedback(false);
                    }}
                    className={cn(
                      'px-4 py-2 text-xs font-medium border transition-colors',
                      soldOut && 'opacity-40 line-through cursor-not-allowed border-foreground/20',
                      !soldOut &&
                        isSelected &&
                        'bg-primary text-primary-foreground border-primary',
                      !soldOut &&
                        !isSelected &&
                        'border-foreground/30 text-cocoa hover:border-primary',
                    )}
                  >
                    {variant.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity selector */}
          <div className="flex items-center gap-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-cocoa">
              Quantity
            </span>
            <div className="inline-flex items-center border border-foreground/30">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 text-cocoa disabled:opacity-35 hover:text-primary"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="px-4 text-sm font-medium tabular-nums">{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={!selectedVariant || quantity >= maxStock}
                onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                className="p-2 text-cocoa disabled:opacity-35 hover:text-primary"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          {validationError && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {validationError}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              disabled={product.stock <= 0}
              onClick={handleAddToBag}
              className="flex-1 bg-primary px-7 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-45"
            >
              {product.stock <= 0 ? 'Sold Out' : 'Add to Bag'}
            </button>

            <button
              type="button"
              onClick={() => toggleWishlist(product.id, product.name)}
              className={cn(
                'inline-flex items-center justify-center gap-2 border px-6 py-3.5 text-xs font-semibold uppercase tracking-widest transition-colors',
                saved
                  ? 'border-primary bg-accent text-primary'
                  : 'border-foreground/30 text-cocoa hover:border-primary',
              )}
            >
              <Heart className={cn('size-4', saved && 'fill-primary')} />
              <span>{saved ? 'Saved' : 'Wishlist'}</span>
            </button>
          </div>

          {addedFeedback && (
            <div className="flex items-center justify-between border border-primary/30 bg-accent/50 px-4 py-3 text-xs">
              <span className="text-cocoa font-medium">Item added to your shopping bag.</span>
              <Link to="/cart" className="font-semibold text-primary underline underline-offset-4">
                View Bag &amp; WhatsApp Checkout →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Related products */}
      {related.length > 0 && (
        <section className="pt-8 border-t border-foreground/15 space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-cocoa">You Might Also Like</h2>
            <Link to={`/${product.category}`} className="text-xs text-terracotta hover:text-primary">
              Explore {product.categoryLabel} →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
