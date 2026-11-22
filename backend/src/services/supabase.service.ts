import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} from '../errors/AppError.js';

let cachedClient: SupabaseClient | null = null;
let cachedAnonClient: SupabaseClient | null = null;

/**
 * Checks whether privileged Supabase server environment variables have been supplied.
 * Strictly requires SUPABASE_SERVICE_ROLE_KEY. The anon key is NEVER used as a fallback.
 */
export function isSupabaseConfigured(): boolean {
  return areSupabaseCredentialsValid();
}

function areSupabaseCredentialsValid(): boolean {
  const url = env.SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(
    url &&
    serviceKey &&
    (url.startsWith('https://') || url.startsWith('http://')) &&
    !url.includes('placeholder') &&
    !url.includes('xyz.supabase.co') &&
    !url.includes('<project-id>') &&
    serviceKey.length >= 20 &&
    !serviceKey.includes('placeholder') &&
    !serviceKey.includes('your-service-role') &&
    !serviceKey.includes('replace-with')
  );
}

/**
 * Backward compatibility alias for isSupabaseConfigured().
 */
export const isSupabaseBackendConfigured = isSupabaseConfigured;

/**
 * Checks whether privileged Supabase server environment variables have been supplied
 * AND the production monetary reconciliation gate is verified for checkout mutation.
 */
export function isSupabaseCheckoutConfigured(): boolean {
  if (!isSupabaseConfigured()) return false;

  // Monetary-Unit Safety Gate:
  // CircleUp canonical unit is integer paise (1 INR = 100 paise).
  // In production, Supabase checkout cannot be activated until product catalog
  // monetary units have been audited and confirmed.
  if (env.NODE_ENV === 'production' && !env.MONETARY_RECONCILIATION_VERIFIED) {
    return false;
  }

  return true;
}

/**
 * Instantiates or retrieves the privileged Supabase client for backend execution.
 * Fails closed if SUPABASE_SERVICE_ROLE_KEY is missing or invalid.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || !areSupabaseCredentialsValid()) {
    throw new ServiceUnavailableError(
      'Privileged Supabase server configuration is missing or invalid. Valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
      'DATABASE_UNAVAILABLE',
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

/**
 * Canonical singleton alias: getSupabaseServiceClient returns the exact same
 * privileged singleton instance as getSupabaseAdminClient.
 */
export const getSupabaseServiceClient = getSupabaseAdminClient;

/**
 * Instantiates or retrieves the unprivileged public Supabase client using SUPABASE_ANON_KEY.
 * Used strictly for public client-side/unprivileged contexts.
 * Fails closed if SUPABASE_ANON_KEY is missing or placeholder.
 */
export function getSupabaseAnonClient(): SupabaseClient {
  if (cachedAnonClient) return cachedAnonClient;

  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();

  if (
    !url ||
    !anonKey ||
    !(url.startsWith('https://') || url.startsWith('http://')) ||
    url.includes('placeholder') ||
    url.includes('xyz.supabase.co') ||
    url.includes('<project-id>') ||
    anonKey.includes('placeholder') ||
    anonKey.includes('replace-with') ||
    anonKey.length < 20
  ) {
    throw new ServiceUnavailableError(
      'Supabase public configuration is missing or invalid. Valid SUPABASE_URL and SUPABASE_ANON_KEY are required.',
      'CONFIG_UNAVAILABLE',
    );
  }

  cachedAnonClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAnonClient;
}

/**
 * Resets cached Supabase clients. Exclusively used by automated test fixtures.
 */
export function resetSupabaseClientForTesting(): void {
  cachedClient = null;
  cachedAnonClient = null;
}

export interface StorefrontCheckoutRpcParams {
  p_key_hash: string;
  p_fingerprint: string;
  p_customer_id: string | null;
  p_customer: {
    name: string;
    email: string;
    phone: string;
  };
  p_shipping_address: {
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
    landmark?: string;
  };
  p_items: Array<{
    serialNumber: string;
    quantity: number;
    size?: string;
  }>;
  p_payment_method: string;
  p_promo_code?: string | null;
  p_notes?: string | null;
  p_guest_access_token_hash?: string | null;
  p_guest_access_expires_at?: string | null;
  p_order_number?: string | null;
}

export interface StorefrontCheckoutRpcResponse {
  id: string;
  orderNumber: string;
  customerId?: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
  };
  items: Array<{
    productId: string;
    serialNumber: string;
    name: string;
    price: number;
    quantity: number;
    size: string;
    image: string;
    slug?: string;
  }>;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalAmount: number;
  status: 'CONFIRMED';
  paymentMethod: string;
  paymentStatus: 'PENDING' | 'PAID';
  promoCode?: string | null;
  notes?: string | null;
  guestAccessToken?: string | null;
  createdAt: string;
}

export async function executeStorefrontCheckoutRpc(
  params: StorefrontCheckoutRpcParams,
  clientOverride?: SupabaseClient,
): Promise<StorefrontCheckoutRpcResponse> {
  if (env.NODE_ENV === 'production' && !env.MONETARY_RECONCILIATION_VERIFIED) {
    throw new ServiceUnavailableError(
      'Storefront checkout via Supabase is blocked in production: product catalog monetary units (paise vs rupees) have not been verified. Set MONETARY_RECONCILIATION_VERIFIED=true only after verifying database prices.',
      'MONETARY_RECONCILIATION_REQUIRED',
    );
  }

  const client = clientOverride || getSupabaseAdminClient();

  const { data, error } = await client.rpc('process_storefront_checkout', params);

  if (error) {
    handlePostgresCheckoutError(error);
  }

  if (!data || typeof data !== 'object') {
    throw new ServiceUnavailableError(
      'Checkout transaction did not commit.',
      'CHECKOUT_NOT_COMMITTED',
    );
  }

  return data as StorefrontCheckoutRpcResponse;
}

interface PostgresRpcError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function handlePostgresCheckoutError(error: PostgresRpcError): never {
  const rawMessage = error.message || '';
  let parsedCode = 'DATABASE_ERROR';
  let parsedMessage = rawMessage;

  try {
    const jsonStart = rawMessage.indexOf('{');
    const jsonEnd = rawMessage.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(rawMessage.slice(jsonStart, jsonEnd + 1)) as {
        code?: string;
        message?: string;
      };
      if (parsed.code) parsedCode = parsed.code;
      if (parsed.message) parsedMessage = parsed.message;
    }
  } catch {
    // Keep rawMessage
  }

  switch (parsedCode) {
    case 'OUT_OF_STOCK':
    case 'INVENTORY_RACE_CONDITION':
    case 'INVALID_QUANTITY':
    case 'INVALID_VARIANT':
    case 'SIZE_REQUIRED':
    case 'VALIDATION_ERROR':
    case 'MISSING_CUSTOMER_INFO':
    case 'INCOMPLETE_ADDRESS':
    case 'EMPTY_ORDER_ITEMS':
    case 'COUPON_REQUIRED':
    case 'UNSUPPORTED_COUPON_TYPE':
      throw new BadRequestError(parsedMessage, parsedCode);

    case 'PRODUCT_NOT_ORDERABLE':
      throw new NotFoundError(parsedMessage, parsedCode);

    case 'IDEMPOTENCY_KEY_REUSED':
    case 'CHECKOUT_IN_PROGRESS':
    case 'COUPON_RESERVATION_FAILED':
      throw new ConflictError(parsedMessage, parsedCode);

    case 'INVALID_PRODUCT_PRICE':
    case 'INVALID_ORDER_TOTAL':
    case 'INVALID_COUPON_DISCOUNT':
      throw new UnprocessableEntityError(parsedMessage, parsedCode);

    case 'PAYMENT_PROVIDER_UNAVAILABLE':
    case 'PAYMENT_METHOD_UNAVAILABLE':
    case 'DATABASE_UNAVAILABLE':
    case 'TRANSACTIONS_UNAVAILABLE':
    case 'CHECKOUT_NOT_COMMITTED':
    case 'CHECKOUT_TRANSACTION_FAILED':
      throw new ServiceUnavailableError(parsedMessage, parsedCode);

    default:
      throw new ServiceUnavailableError(
        parsedMessage || 'Checkout operation failed.',
        'CHECKOUT_TRANSACTION_FAILED',
      );
  }
}
