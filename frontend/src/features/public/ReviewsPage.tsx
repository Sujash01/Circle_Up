import { Star } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { reviewService } from '@/services/communityServices';
import { productService } from '@/services/productService';
import type { ReviewItem } from '@/types/storefront';

export function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>(() => reviewService.getAllReviews());
  const [ratingFilter, setRatingFilter] = useState<number>(0);

  const [displayName, setDisplayName] = useState('');
  const [rating, setRating] = useState(5);
  const [productSlug, setProductSlug] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submittedNotice, setSubmittedNotice] = useState(false);

  const allProducts = productService.getAllProducts();

  const visibleReviews = useMemo(
    () => (ratingFilter === 0 ? reviews : reviews.filter((r) => r.rating === ratingFilter)),
    [reviews, ratingFilter],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmittedNotice(false);

    if (displayName.trim().length < 2) {
      setError('Please enter your display name.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Please enter a short review headline.');
      return;
    }
    if (comment.trim().length < 10) {
      setError('Please write at least 10 characters in your review.');
      return;
    }

    const linkedProduct = productSlug ? productService.getProductBySlug(productSlug) : undefined;
    reviewService.submitReview({
      displayName,
      rating,
      title,
      comment,
      productSlug: linkedProduct?.slug,
      productName: linkedProduct?.name,
    });

    setReviews(reviewService.getAllReviews());
    setDisplayName('');
    setTitle('');
    setComment('');
    setProductSlug('');
    setRating(5);
    setSubmittedNotice(true);
  };

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-foreground/15 pb-7">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">
            Community Notes &amp; Sample Feedback
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">Reviews</h1>
          <p className="mt-2 max-w-xl text-sm text-foreground/80">
            Sample reviews and locally simulated browser submissions — not independently
            verified customer reviews.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-terracotta uppercase tracking-wider">Filter Rating:</span>
          {[0, 5, 4, 3].map((stars) => (
            <button
              key={stars}
              type="button"
              onClick={() => setRatingFilter(stars)}
              className={cn(
                'pb-0.5 border-b',
                ratingFilter === stars
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-terracotta hover:text-cocoa',
              )}
            >
              {stars === 0 ? 'All' : `${stars}★`}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] items-start">
        {/* Editorial testimonial list */}
        <div className="divide-y divide-foreground/15">
          {visibleReviews.map((review) => (
            <article key={review.id} className="py-6 first:pt-0 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-primary" aria-label={`${review.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={cn(
                        'size-3.5',
                        idx < review.rating ? 'fill-primary text-primary' : 'text-foreground/25',
                      )}
                    />
                  ))}
                </div>
                <span className="text-[0.7rem] uppercase tracking-wider text-terracotta">
                  {review.isLocalSubmission ? 'Saved Locally (Browser Simulation)' : 'Sample Review'}
                </span>
              </div>

              <h2 className="font-display text-2xl text-cocoa">&ldquo;{review.title}&rdquo;</h2>
              <p className="text-sm leading-relaxed text-foreground/85">{review.comment}</p>

              <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-terracotta">
                <span className="font-semibold text-cocoa">{review.displayName}</span>
                {review.productSlug && review.productName && (
                  <>
                    <span>·</span>
                    <Link
                      to={`/product/${review.productSlug}`}
                      className="underline underline-offset-4 hover:text-primary"
                    >
                      {review.productName}
                    </Link>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* Review submission form */}
        <form onSubmit={handleSubmit} className="bg-card/85 border border-foreground/15 p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="font-display text-2xl text-cocoa">Leave a Simulated Review</h2>
            <p className="mt-1 text-xs text-terracotta">
              Saved only to this browser&apos;s LocalStorage.
            </p>
          </div>

          <div>
            <label htmlFor="rev-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Display Name
            </label>
            <input
              id="rev-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="e.g. Priya R."
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rev-rating" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Rating
              </label>
              <select
                id="rev-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              >
                <option value={5}>5 — Loved it</option>
                <option value={4}>4 — Very good</option>
                <option value={3}>3 — Good</option>
                <option value={2}>2 — Fair</option>
                <option value={1}>1 — Needs work</option>
              </select>
            </div>

            <div>
              <label htmlFor="rev-product" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Piece (Optional)
              </label>
              <select
                id="rev-product"
                value={productSlug}
                onChange={(e) => setProductSlug(e.target.value)}
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              >
                <option value="">General Store Experience</option>
                {allProducts.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="rev-title" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Headline
            </label>
            <input
              id="rev-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Sum up your thoughts"
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="rev-comment" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Review
            </label>
            <textarea
              id="rev-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required
              placeholder="Share notes on fit, fabric, condition, or packaging..."
              className="w-full border border-foreground/25 bg-transparent p-3 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-primary py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
          >
            Submit Simulated Review
          </button>

          {submittedNotice && (
            <p className="text-xs text-primary font-medium">
              Review added locally to your browser preview.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

