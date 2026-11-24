export function StorefrontListStatus({ status, label, onRetry }: {
  status: 'loading' | 'network-error' | 'server-error';
  label: string;
  onRetry: () => void;
}) {
  if (status === 'loading') return <p role="status" className="text-sm text-muted-foreground">Loading {label}…</p>;
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">
        {status === 'network-error'
          ? `Could not connect to load ${label}. Check your connection and try again.`
          : `We could not load ${label} right now. Please try again.`}
      </p>
      <button type="button" onClick={onRetry} className="border border-foreground/20 px-4 py-2 text-sm text-primary">
        Try again
      </button>
    </div>
  );
}
