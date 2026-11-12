import type { Server } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

let server: Server | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function scheduleDevReconnect(): void {
  if (reconnectTimer) return;

  reconnectTimer = setInterval(async () => {
    try {
      await connectDatabase();
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      logger.info('MongoDB connection restored');
    } catch {
      logger.debug('Waiting for MongoDB to become reachable...');
    }
  }, 15_000);
  reconnectTimer.unref();
}

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
  } catch (err) {
    if (env.NODE_ENV !== 'development') {
      throw err;
    }

    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'MongoDB is not reachable. Starting CircleUp API in degraded dev mode — set a MongoDB Atlas URI or start local mongod in backend/.env.',
    );
    scheduleDevReconnect();
  }

  const app = createApp();
  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CircleUp API listening');
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received; closing HTTP server and DB pool');

  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
  }

  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start CircleUp API');
  process.exit(1);
});
