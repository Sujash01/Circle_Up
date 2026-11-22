import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

let server: Server | null = null;
export function resetServerStateForTesting(): void {
  server = null;
}

export const app = createApp();

export async function bootstrap(): Promise<void> {
  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CircleUp API listening');
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received; closing HTTP server');

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
  }

  process.exit(0);
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
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
}

export default app;
