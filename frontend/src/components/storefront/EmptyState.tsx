import { Link } from 'react-router-dom';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

/**
 * Editorial empty state with clear recovery action.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="py-16 px-4 text-center max-w-md mx-auto">
      <h2 className="font-display text-2xl text-cocoa">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-terracotta">{description}</p>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="mt-6 inline-block bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-forest-deep transition-colors"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-block bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-forest-deep transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

