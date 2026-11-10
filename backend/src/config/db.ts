import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

/**
 * Connects Mongoose to MongoDB with tuned connection pool and selection timeouts.
 */
export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(uri, {
    minPoolSize: env.NODE_ENV === 'test' ? 1 : 5,
    maxPoolSize: env.NODE_ENV === 'test' ? 5 : 20,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  logger.info('Connected to MongoDB');
}

/**
 * Gracefully closes the active Mongoose connection pool.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

/**
 * Maps Mongoose numeric connection readyState to a readable status label.
 */
export function getDatabaseStatus():
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'disconnecting' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}

