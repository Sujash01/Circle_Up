import { Router } from 'express';
import mongoose from 'mongoose';
import type { HealthCheckData } from '@circleup/shared';
import { getDatabaseStatus } from '../../config/db.js';
import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let dbStatus = getDatabaseStatus();

  if (dbStatus === 'connected' && mongoose.connection.db) {
    try {
      await mongoose.connection.db.admin().ping();
    } catch {
      dbStatus = 'disconnected';
    }
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

