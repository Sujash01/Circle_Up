import mongoose, { type ClientSession } from 'mongoose';

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
  } finally {
    await session.endSession();
  }
}

