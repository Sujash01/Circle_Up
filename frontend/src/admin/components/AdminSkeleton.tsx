export function AdminTableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full animate-pulse space-y-3" aria-busy="true">
      <div className="h-10 bg-[#1e2a1c]/10 rounded-xl w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-4 border border-[#1e2a1c]/10 rounded-2xl bg-[#1e2a1c]/5">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-5 bg-[#1e2a1c]/10 rounded-md"
              style={{ width: `${Math.max(15, 100 / cols - 5)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AdminCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="p-5 rounded-2xl border border-[#1e2a1c]/10 bg-[#1e2a1c]/5 space-y-3">
          <div className="h-4 bg-[#1e2a1c]/15 rounded w-1/2" />
          <div className="h-8 bg-[#1e2a1c]/20 rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

