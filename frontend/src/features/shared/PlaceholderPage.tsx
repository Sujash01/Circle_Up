import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { ApiSuccessResponse, HealthCheckData } from '@circleup/shared';
import { apiClient } from '../../services/apiClient';

interface PlaceholderPageProps {
  title: string;
  milestone: string;
  showHealthProbe?: boolean;
}

/**
 * Structural engineering stub rendered for routes awaiting Milestone M1-M7 UI views.
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
    <section>
      <h1>{title}</h1>
      <p>Scheduled Implementation: {milestone}</p>
      {Object.keys(params).length > 0 && (
        <pre>{JSON.stringify(params, null, 2)}</pre>
      )}
      {showHealthProbe && (
        <div>
          <h2>API Readiness</h2>
          {healthQuery.isPending && <p>Checking backend /api/v1/health...</p>}
          {healthQuery.isError && <p>Backend unavailable or degraded.</p>}
          {healthQuery.data && <pre>{JSON.stringify(healthQuery.data, null, 2)}</pre>}
        </div>
      )}
    </section>
  );
}

