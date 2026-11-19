import { CheckoutIdempotency } from '../models/CheckoutIdempotency.js';
import { ServiceUnavailableError } from '../errors/AppError.js';

/** Runtime verification only. Index creation belongs to the explicit migration command. */
export async function verifyCheckoutIndexes(): Promise<void> {
  try {
    const indexes = await CheckoutIdempotency.collection.listIndexes().toArray();
    const hasUniqueKey = indexes.some((index) =>
      index.unique === true &&
      Object.keys(index.key || {}).length === 1 &&
      index.key?.keyHash === 1 &&
      !index.partialFilterExpression &&
      index.sparse !== true,
    );
    const hasExpiryTtl = indexes.some((index) =>
      index.expireAfterSeconds === 0 &&
      Object.keys(index.key || {}).length === 1 &&
      index.key?.expiresAt === 1 &&
      !index.partialFilterExpression &&
      index.sparse !== true,
    );
    if (!hasUniqueKey || !hasExpiryTtl) {
      throw new ServiceUnavailableError(
        'Checkout indexes are missing. Run the checkout index migration before enabling checkout.',
        'CHECKOUT_INDEXES_UNAVAILABLE',
      );
    }
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError(
      'Checkout indexes could not be verified. Checkout is temporarily unavailable.',
      'CHECKOUT_INDEXES_UNAVAILABLE',
    );
  }
}
