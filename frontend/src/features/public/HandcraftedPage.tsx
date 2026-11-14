import { Link } from 'react-router-dom';
import { formatPrice } from '@/services/cartService';
import { productService } from '@/services/productService';

export function HandcraftedPage() {
  const handcraftedProducts = productService.queryProducts({ category: 'handcrafted' });

  return (
    <div className="space-y-14">
      <header className="max-w-2xl space-y-3 border-b border-foreground/15 pb-8">
        <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">
          Studio Craft &amp; Upcycled Textiles
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-cocoa">Handcrafted</h1>
        <p className="text-sm leading-relaxed text-foreground/80">
          Small-batch pieces pieced from salvaged denim, slow hand-crocheted cotton, and wooden
          block-printed reclaimed silk.
        </p>
      </header>

      {/* Maker-focused alternating editorial rows */}
      <div className="space-y-16">
        {handcraftedProducts.map((product, index) => {
          const reverse = index % 2 === 1;
          return (
            <article
              key={product.id}
              className="grid gap-8 lg:grid-cols-2 items-center pb-14 border-b border-foreground/10 last:border-b-0"
            >
              <Link
                to={`/product/${product.slug}`}
                className={reverse ? 'lg:order-2 block overflow-hidden bg-[#ece6d2]' : 'block overflow-hidden bg-[#ece6d2]'}
              >
                <img
                  src={product.images[0]}
                  alt={product.name}
                  loading="lazy"
                  className="aspect-[4/4.3] w-full object-cover object-top hover:scale-[1.02] transition-transform duration-700"
                />
              </Link>

              <div className={reverse ? 'lg:order-1 lg:pr-8 space-y-4' : 'lg:pl-8 space-y-4'}>
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-terracotta">
                  {product.subcategory} · {product.condition}
                </p>
                <h2 className="font-display text-3xl text-cocoa">{product.name}</h2>
                <p className="text-sm leading-relaxed text-foreground/85">{product.description}</p>

                {product.makerNote && (
                  <blockquote className="border-l-2 border-primary pl-4 text-xs leading-relaxed text-steel italic">
                    Maker note: {product.makerNote}
                  </blockquote>
                )}

                <div className="pt-2 flex flex-wrap items-center gap-6">
                  <span className="text-xl font-bold text-primary tabular-nums">
                    {formatPrice(product.price)}
                  </span>
                  <span className="text-xs text-terracotta">
                    {product.stock > 0 ? `${product.stock} piece(s) ready` : 'Currently sold out'}
                  </span>
                </div>

                <div className="pt-2">
                  <Link
                    to={`/product/${product.slug}`}
                    className="inline-block bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
                  >
                    View Craft Details
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

