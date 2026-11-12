import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { ApiSuccessResponse, HealthCheckData } from '@circleup/shared';
import { apiClient } from '../../services/apiClient';

interface PlaceholderPageProps {
  title: string;
  milestone: string;
  showHealthProbe?: boolean;
}

/**
 * Branded route stub rendered for views scheduled across Milestones M1-M7.
 */
export function PlaceholderPage({
  title,
  milestone,
  showHealthProbe = false,
}: PlaceholderPageProps) {
  const params = useParams();
  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccessResponse<HealthCheckData>>('/health');
      return res.data.data;
    },
    enabled: showHealthProbe,
  });

  return (
    <section className="rounded-2xl border-2 border-foreground/15 bg-card p-6 sm:p-8 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-foreground/15 pb-4">
        <div>
          <span className="inline-block rounded-full bg-primary px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
            {milestone}
          </span>
          <h1 className="mt-2 text-3xl text-cocoa">{title}</h1>
        </div>
        <Link
          to="/"
          className="rounded-full border border-foreground/25 px-4 py-2 text-xs font-semibold text-cocoa hover:border-primary hover:text-primary"
        >
          ← Back to Landing
        </Link>
      </div>

      {Object.keys(params).length > 0 && (
        <pre className="mt-4 rounded-xl bg-secondary p-4 text-xs text-cocoa">
          {JSON.stringify(params, null, 2)}
        </pre>
      )}

      {showHealthProbe && (
        <div className="mt-6">
          <h2 className="text-lg text-cocoa">API Readiness</h2>
          {healthQuery.isPending && (
            <p className="mt-2 text-sm text-terracotta">Checking backend /api/v1/health...</p>
          )}
          {healthQuery.isError && (
            <p className="mt-2 text-sm text-destructive">Backend unavailable or degraded.</p>
          )}
          {healthQuery.data && (
            <pre className="mt-2 rounded-xl bg-secondary p-4 text-xs text-cocoa">
              {JSON.stringify(healthQuery.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
