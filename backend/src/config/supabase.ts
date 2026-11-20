import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { logger } from './logger.js';

let supabaseServiceClient: SupabaseClient | null = null;
let supabaseAnonClient: SupabaseClient | null = null;

/**
 * Checks whether valid Supabase environment variables are configured on the backend.
 */
export function isSupabaseBackendConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_URL.startsWith('http'));
}

/**
 * Returns a privileged Supabase client powered by the service-role secret key.
 * Used exclusively for administrative operations, audit logging, and direct RLS bypass.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (!supabaseServiceClient) {
    if (!isSupabaseBackendConfigured()) {
      logger.warn('Supabase service client requested but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
    }
    supabaseServiceClient = createClient(
      env.SUPABASE_URL || 'https://placeholder.supabase.co',
      env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return supabaseServiceClient;
}

/**
 * Returns an unprivileged Supabase client using the public anon key.
 * Used for public storefront operations respecting Row-Level Security (RLS).
 */
export function getSupabaseAnonClient(): SupabaseClient {
  if (!supabaseAnonClient) {
    supabaseAnonClient = createClient(
      env.SUPABASE_URL || 'https://placeholder.supabase.co',
      env.SUPABASE_ANON_KEY || 'placeholder-anon-key',
    );
  }
  return supabaseAnonClient;
}
