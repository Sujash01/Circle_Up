/**
 * Authoritative Supabase Client Provider (Re-export / Compatibility Layer)
 *
 * CircleUp Architectural Rule:
 * All Supabase client instantiation is centralized in `backend/src/services/supabase.service.ts`.
 * This module re-exports the canonical client functions to preserve backward compatibility
 * without maintaining duplicate client singletons or permitting placeholder credentials.
 */

export {
  isSupabaseConfigured,
  isSupabaseBackendConfigured,
  isSupabaseCheckoutConfigured,
  getSupabaseAdminClient,
  getSupabaseServiceClient,
  getSupabaseAnonClient,
  resetSupabaseClientForTesting,
  type StorefrontCheckoutRpcParams,
  type StorefrontCheckoutRpcResponse,
} from '../services/supabase.service.js';

export type { SupabaseClient } from '@supabase/supabase-js';
