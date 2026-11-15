import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  '';

const supabasePublishableKey =
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  '';

/**
 * Checks whether valid Supabase environment variables have been supplied.
 */
export function isSupabaseConfigured(): boolean {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabasePublishableKey) &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder')
  );
}

// Fallback dummy URL and key to prevent client instantiation from crashing at module evaluation time
// if the user has not yet populated their .env file.
const effectiveUrl = isSupabaseConfigured()
  ? supabaseUrl
  : 'https://placeholder-project.supabase.co';
const effectiveKey = isSupabaseConfigured()
  ? supabasePublishableKey
  : 'placeholder-anon-key-circleup-development';

/**
 * Safely parses document.cookie into key-value pairs without throwing.
 */
function parseCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const map: Record<string, string> = {};
  const raw = document.cookie || '';
  if (!raw) return map;

  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      map[k] = v;
    }
  }
  return map;
}

/**
 * Single Supabase browser client with resilient dual storage:
 * Synchronizes auth session tokens and PKCE code verifiers across both document cookies
 * and window.localStorage. This guarantees that verifier lookups succeed even if an external
 * email client opens a window where one storage mechanism was delayed or isolated.
 */
export const supabase: SupabaseClient = createBrowserClient(effectiveUrl, effectiveKey, {
  cookies: {
    getAll() {
      if (typeof window === 'undefined') return [];

      const cookieMap = parseCookies();
      const all: { name: string; value: string }[] = Object.keys(cookieMap).map((k) => ({
        name: k,
        value: cookieMap[k] ?? '',
      }));

      // Dual fallback: if an auth token or verifier item is preserved in localStorage, ensure it is surfaced
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('verifier'))) {
            if (!(key in cookieMap)) {
              const val = window.localStorage.getItem(key);
              if (val !== null) {
                all.push({ name: key, value: val });
              }
            }
          }
        }
      } catch {
        // Safe ignore if localStorage access is disabled in strict mode
      }

      return all;
    },
    setAll(cookiesToSet) {
      if (typeof document === 'undefined') return;

      cookiesToSet.forEach(({ name, value, options }) => {
        // 1. Write to document.cookie
        const maxAgeStr = options?.maxAge !== undefined ? `; max-age=${options.maxAge}` : '';
        const sameSiteStr = options?.sameSite ? `; samesite=${options.sameSite}` : '; samesite=lax';
        const pathStr = `; path=${options?.path || '/'}`;
        document.cookie = `${name}=${value}${pathStr}${maxAgeStr}${sameSiteStr}`;

        // 2. Mirror auth tokens and PKCE verifiers to localStorage for cross-tab persistence
        try {
          if (typeof window !== 'undefined' && (name.startsWith('sb-') || name.includes('verifier'))) {
            if (options?.maxAge === 0) {
              window.localStorage.removeItem(name);
            } else {
              window.localStorage.setItem(name, value);
            }
          }
        } catch {
          // Safe ignore if storage quota exceeded
        }
      });
    },
  },
});
