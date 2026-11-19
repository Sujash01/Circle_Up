import mongoose, { type ClientSession } from 'mongoose';
import { ServiceUnavailableError } from '../errors/AppError.js';

/**
 * Executes a callback inside a MongoDB ACID transaction with automatic retry
 * handling for TransientTransactionError and UnknownTransactionCommitResult.
 */
export async function runInTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/Transaction numbers are only allowed|does not support transactions|transactions are not supported/i.test(message)) {
      throw new ServiceUnavailableError('This operation requires MongoDB replica set or sharded transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

