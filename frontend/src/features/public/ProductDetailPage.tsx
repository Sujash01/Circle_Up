import { Heart, Minus, Plus, Ruler } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Product, ProductVariant } from '@/types/storefront';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/storefront/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import { SizeGuideModal } from '@/components/storefront/SizeGuideModal';
import { useStore } from '@/context/StoreContext';
import { cn } from '@/lib/utils';
import { formatPrice } from '@circleup/shared';
import { cartService } from '@/services/cartService';
import { mapRawProductToStorefront, productService, useCatalogVersion } from '@/services/productService';
import { storefrontApi } from '@/services/storefrontApi';
import { useStorefrontSettings } from '@/services/storefrontSettingsService';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
  type InventoryStatusCode,
  extractCategoryCodeFromSerial,
  formatDisplaySerial,
  cleanSizeLabel,
  extractMeasurementsFromSizeString,
} from '@circleup/shared';

function WhatsAppIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function ProductDetailPage() {
  const { whatsappNumber } = useStorefrontSettings();
  const { slug = '' } = useParams();
  const catalogVersion = useCatalogVersion();
  const [asyncProduct, setAsyncProduct] = useState<Product | null>(null);
  const [isFetchingProduct, setIsFetchingProduct] = useState(false);

  const memoryProduct = useMemo(() => {
    void catalogVersion;
    return productService.getProductBySlug(slug);
  }, [slug, catalogVersion]);

  const product: Product | undefined = memoryProduct || (asyncProduct ?? undefined);
  const { addToCart, isWishlisted, toggleWishlist } = useStore();

  useEffect(() => {
    if (!slug) return;
    if (memoryProduct) return;

    let active = true;
    const ac = new AbortController();
    setIsFetchingProduct(true);
    storefrontApi
      .getProductBySlug(slug, ac.signal)
      .then((p) => {
        if (active && p) {
          setAsyncProduct(mapRawProductToStorefront(p as unknown as Record<string, unknown>));
        }
      })
      .catch(() => {
        // Keep null if not found
      })
      .finally(() => {
        if (active) setIsFetchingProduct(false);
      });

    return () => {
      active = false;
      ac.abort();
    };
  }, [slug, memoryProduct]);

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [validationError, setValidationError] = useState<string>('');
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);

  const catCode =
    product?.categoryCode ||
    (product?.serialNumber ? extractCategoryCodeFromSerial(product.serialNumber) : undefined);
  const catMeta = catCode ? INVENTORY_CATEGORIES[catCode] : undefined;

  const rawStatus = (product?.status || '').toUpperCase() as InventoryStatusCode;
  const invStatus =
    INVENTORY_STATUSES[rawStatus] ||
    ((product?.stock ?? 0) <= 0 ? INVENTORY_STATUSES.SOLD : INVENTORY_STATUSES.AVAILABLE);

  const isPurchasable = Boolean(product && invStatus.isPurchasable && product.stock > 0);

  const extractedMeasurements = useMemo(() => {
    if (typeof product?.measurements === 'string' && product.measurements.trim().length > 0) {
      return product.measurements;
    }
    if (product?.sizes && product.sizes.length > 0) {
      for (const sz of product.sizes) {
        const extracted = extractMeasurementsFromSizeString(sz);
        if (extracted) return extracted;
      }
    }
    return undefined;
  }, [product]);

  const availableVariants: ProductVariant[] = useMemo(() => {
    if (product && Array.isArray(product.variants) && product.variants.length > 0) {
      return product.variants;
    }
    const sizes =
      product && Array.isArray(product.sizes) && product.sizes.length > 0
        ? product.sizes
        : ['One Size'];
    return sizes.map((sz, idx) => ({
      id: `${product?.serialNumber || product?.id || 'var'}-${idx}-${cleanSizeLabel(sz).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      label: cleanSizeLabel(sz),
      size: cleanSizeLabel(sz),
      stock: product?.stock ?? 0,
    }));
  }, [product]);

  useEffect(() => {
    setActiveImageIdx(0);
    setQuantity(1);
    setValidationError('');
    setAddedFeedback(false);
    const firstAvailable = availableVariants.find((v) => v.stock > 0);
    if (availableVariants.length === 1 && firstAvailable) {
      setSelectedVariantId(firstAvailable.id);
    } else {
      setSelectedVariantId('');
    }
  }, [slug, availableVariants]);

  useEffect(() => {
    if (product) {
      document.title = `${product.name} — CircleUp`;
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) {
        descMeta.setAttribute(
          'content',
          product.description || `Buy ${product.name} on CircleUp.`,
        );
      }
    }
  }, [product]);

  const productJsonLd = useMemo(() => {
    if (!product) return null;
    const priceInRupees = (product.price / 100).toFixed(2);
    const imageUrl = product.images?.[0]
      ? product.images[0].startsWith('http')
        ? product.images[0]
        : `https://circleuponline.com${product.images[0]}`
      : 'https://circleuponline.com/og-circleup.png';

    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description || `${product.name} from CircleUp curated catalog.`,
      image: product.images?.map((img) =>
        img.startsWith('http') ? img : `https://circleuponline.com${img}`
      ) || [imageUrl],
      sku: formatDisplaySerial(product.serialNumber, product.id),
      brand: {
        '@type': 'Brand',
        name: 'CircleUp',
      },
      offers: {
        '@type': 'Offer',
        price: priceInRupees,
        priceCurrency: 'INR',
        availability: isPurchasable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `https://circleuponline.com/product/${product.slug}`,
        itemCondition: product.condition === 'New With Tags' || product.productType === 'Fresh Find'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
      },
    };
  }, [product, isPurchasable]);

  if (!product) {
    if (isFetchingProduct) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-12 animate-pulse space-y-8">
          <div className="h-6 w-32 bg-foreground/10 rounded-full" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-[4/5] bg-foreground/10 rounded-3xl" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 bg-foreground/10 rounded-xl" />
              <div className="h-6 w-1/4 bg-foreground/10 rounded-xl" />
              <div className="h-24 w-full bg-foreground/10 rounded-2xl" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        title="This piece could not be found"
        description="It may have moved or the URL slug is mistyped. Explore freshly curated pieces instead."
        actionLabel="Browse New Arrivals"
        actionTo="/new-arrivals"
      />
    );
  }

  const selectedVariant = availableVariants.find((v) => v.id === selectedVariantId);
  const activePrice = selectedVariant?.priceOverride ?? product.price;
  const maxStock = selectedVariant ? selectedVariant.stock : product.stock;
  const saved = isWishlisted(product.id);
  const related = productService.getRelatedProducts(product, 4);

  const whatsappEnquiryUrl = cartService.buildProductWhatsAppUrl(
    product,
    selectedVariant?.label,
    whatsappNumber,
    { size: selectedVariant?.size ?? product.sizes[0] ?? 'One Size', quantity, unitPrice: selectedVariant?.priceOverride ?? product.price },
  );

  const handleAddToBag = () => {
    if (!isPurchasable) {
      setValidationError(`This piece is marked as ${invStatus.badgeText} and is not available for standard purchase.`);
      return;
    }
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
      {productJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      {/* Breadcrumb navigation */}
      <nav aria-label="Breadcrumb" className="text-xs text-terracotta flex flex-wrap items-center gap-2">
        <Link to="/" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <Link to={`/${product.category}`} className="inline-flex min-h-[44px] items-center hover:text-primary">
          {product.categoryLabel}
        </Link>
        <span>/</span>
        <span className="text-cocoa font-medium">{product.name}</span>
      </nav>

      {/* Main image-led split */}
      <section className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] items-start">
        {/* Image gallery */}
        <div className="space-y-4">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-foreground/15 bg-tile flex items-center justify-center p-2 sm:p-3 shadow-xs">
            <img
              src={product.images[activeImageIdx] ?? product.images[0]}
              alt={`${product.name} view ${activeImageIdx + 1}`}
              loading="eager"
              decoding="async"
              className="h-full w-full object-contain"
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
                    'w-20 aspect-[4/5] shrink-0 overflow-hidden rounded-xl border bg-tile p-1 transition-all',
                    activeImageIdx === idx
                      ? 'border-2 border-primary opacity-100 shadow-xs'
                      : 'border-foreground/15 opacity-70 hover:opacity-100',
                  )}
                >
                  <img
                    src={imgSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product storytelling & controls */}
        <div className="lg:pl-4 space-y-6">
          <div className="space-y-2 border-b border-foreground/15 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-terracotta">
                  {product.categoryLabel} · {product.subcategory}
                </p>
                {catCode && (
                  <span className="font-mono text-[0.68rem] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20" title={catMeta?.description}>
                    CODE: {catCode}
                  </span>
                )}
              </div>

              {/* Exact spreadsheet inventory status pill */}
              <div className="flex items-center gap-2">
                <span
                  style={{
                    backgroundColor: invStatus.bgColor,
                    color: invStatus.textColor,
                    borderColor: invStatus.borderColor,
                  }}
                  className="font-medium text-[0.7rem] px-2.5 py-0.5 border shadow-2xs uppercase tracking-wider rounded-full"
                >
                  {invStatus.badgeText}
                </span>
                <span className="font-mono text-[0.7rem] bg-secondary px-2 py-0.5 text-cocoa font-medium tracking-wide border border-foreground/10">
                  SERIAL: {formatDisplaySerial(product.serialNumber, product.id)}
                </span>
              </div>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight">
              {product.name}
            </h1>

            <div className="pt-2 flex items-baseline gap-4">
              <span className="text-2xl font-bold text-destructive tabular-nums">
                {formatPrice(activePrice)}
              </span>
              {product.originalPrice && product.originalPrice > activePrice && (
                <span className="text-sm text-muted-foreground line-through tabular-nums">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground/85">{product.description}</p>

          <dl className="grid grid-cols-2 gap-y-2 text-xs border-y border-foreground/15 py-4">
            <dt className="uppercase tracking-wider text-terracotta">Item Serial No.</dt>
            <dd className="font-mono font-medium text-cocoa">{formatDisplaySerial(product.serialNumber, product.id)}</dd>

            {catCode && (
              <>
                <dt className="uppercase tracking-wider text-terracotta">Category Code</dt>
                <dd className="font-medium text-cocoa">
                  <span className="font-mono font-bold text-primary">{catCode}</span>
                  {catMeta ? ` (${catMeta.name})` : ''}
                </dd>
              </>
            )}

            <dt className="uppercase tracking-wider text-terracotta">Inventory Status</dt>
            <dd className="font-medium text-cocoa">
              <span
                style={{
                  backgroundColor: invStatus.bgColor,
                  color: invStatus.textColor,
                  borderColor: invStatus.borderColor,
                }}
                className="inline-block px-2 py-0.5 text-[0.68rem] font-semibold rounded border"
              >
                {invStatus.label}
              </span>
            </dd>

            <dt className="uppercase tracking-wider text-terracotta">Condition</dt>
            <dd className="font-medium text-cocoa">{product.condition}</dd>

            <dt className="uppercase tracking-wider text-terracotta">Stock / Pieces</dt>
            <dd className="font-medium text-cocoa">
              {product.stock > 0
                ? `${product.stock} piece${product.stock > 1 ? 's' : ''} available`
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

          {/* Special Barter or Rental Notification */}
          {invStatus.code === 'EXCHANGE_BARTER' && (
            <div className="rounded-xl border border-[#9ec5fe] bg-[#cfe2ff]/40 p-3.5 text-xs text-[#084298] space-y-1">
              <span className="font-bold uppercase tracking-wider block">Circular Barter &amp; Wardrobe Swap</span>
              <p>This item is open for direct wardrobe barter or circular exchange. Send photos and measurements of your trade piece via WhatsApp!</p>
            </div>
          )}

          {invStatus.code === 'RENT' && (
            <div className="rounded-xl border border-[#e8a7d5] bg-[#f8d7da]/40 p-3.5 text-xs text-[#6f195d] space-y-1">
              <span className="font-bold uppercase tracking-wider block">CircleUp Rental Archive</span>
              <p>This archival piece is reserved for editorial shoots and short-term rentals. Contact us directly on WhatsApp to confirm dates.</p>
            </div>
          )}

          {product.makerNote && (
            <p className="border-l-2 border-primary pl-4 text-xs italic text-steel">
              {product.makerNote}
            </p>
          )}

          {/* Size / Variant selector + Size Guide Trigger */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs flex-wrap gap-2">
              <span className="font-semibold uppercase tracking-wider text-cocoa">
                Select Size / Option
              </span>

              {/* Interactive Size Guide Modal Trigger */}
              <button
                type="button"
                onClick={() => setIsSizeGuideOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-forest-deep underline underline-offset-4 transition-colors"
              >
                <Ruler className="size-3.5" />
                <span>View Size Guide &amp; Measurements</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {availableVariants.map((variant) => {
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
                      'organic-control px-4 py-2 text-xs font-medium border transition-colors',
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
            <div className="organic-control inline-flex items-center border border-foreground/30">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="min-h-[44px] min-w-[44px] p-2 text-cocoa disabled:opacity-35 hover:text-primary"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="px-4 text-sm font-medium tabular-nums">{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={!selectedVariant || quantity >= maxStock}
                onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                className="min-h-[44px] min-w-[44px] p-2 text-cocoa disabled:opacity-35 hover:text-primary"
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

          {/* Action buttons - 2 clean options: Enquire on WhatsApp (WhatsApp Green) & Add to Cart */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {whatsappEnquiryUrl && <a
              href={whatsappEnquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-6 py-3.5 text-xs font-bold uppercase tracking-widest transition-colors shadow-xs"
            >
              <WhatsAppIcon className="size-4" />
              <span>Enquire on WhatsApp</span>
            </a>}

            <button
              type="button"
              disabled={!isPurchasable}
              onClick={handleAddToBag}
              className="flex-1 bg-primary px-7 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-45"
            >
              {!isPurchasable
                ? invStatus.code === 'BOOKED'
                  ? 'Reserved / Booked'
                  : invStatus.code === 'RENT'
                    ? 'Rental Piece (Enquire)'
                    : 'Sold Out'
                : 'Add to Cart'}
            </button>

            <button
              type="button"
              aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
              onClick={() => toggleWishlist(product.id, product.name)}
              className={cn(
                'inline-flex items-center justify-center gap-2 border px-4 py-3.5 text-xs font-semibold uppercase tracking-widest transition-colors shrink-0',
                saved
                  ? 'border-primary bg-accent text-primary'
                  : 'border-foreground/30 text-cocoa hover:border-primary',
              )}
            >
              <Heart className={cn('size-4', saved && 'fill-primary text-primary')} />
            </button>
          </div>

          {addedFeedback && (
            <div className="flex items-center justify-between border border-primary/30 bg-accent/50 px-4 py-3 text-xs">
              <span className="text-cocoa font-medium">Item added to your shopping bag.</span>
              <Link to="/cart" className="inline-flex min-h-[44px] items-center font-semibold text-primary underline underline-offset-4">
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
            <Link to={`/${product.category}`} className="inline-flex min-h-[44px] items-center text-xs text-terracotta hover:text-primary">
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

      {/* Size Guide Modal with Canonical 6 Garment Silhouettes */}
      <SizeGuideModal
        isOpen={isSizeGuideOpen}
        onClose={() => setIsSizeGuideOpen(false)}
        categoryCode={catCode}
        categorySlug={product.category}
        productName={product.name}
        measurementsData={product.measurementsData}
        measurementsText={extractedMeasurements}
      />
    </div>
  );
}
