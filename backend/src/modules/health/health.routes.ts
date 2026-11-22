import { Router } from 'express';
import type { HealthCheckData } from '@circleup/shared';
import { env } from '../../config/env.js';
import { getSupabaseAdminClient } from '../../services/supabase.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let dbStatus: HealthCheckData['db'] = 'disconnected';
  try {
    const { error } = await getSupabaseAdminClient().from('products').select('id').limit(1);
    if (!error) dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected';
  const payload: HealthCheckData = {
    status: isHealthy ? 'ok' : 'degraded',
    db: dbStatus,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  };

  sendSuccess(res, payload, { statusCode: isHealthy ? 200 : 503 });
});

