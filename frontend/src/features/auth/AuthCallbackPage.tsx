import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getSafeAuthRedirect } from '@/services/authService';
import { AlertCircle, Loader2 } from 'lucide-react';
import circleUpLogo from '@/assets/circle-up-logo.png';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Verifying your session...');

  useEffect(() => {
    let isMounted = true;

    async function handleCallback() {
      try {
        const hash = window.location.hash;
        const search = window.location.search;
        const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery');

        // 1. Immediate password recovery flow redirect if hash-based
        if (isRecovery && (hash.includes('access_token') || hash.includes('refresh_token'))) {
          if (isMounted) setStatusText('Redirecting to reset your password...');
          navigate('/auth/reset-password', { replace: true });
          return;
        }

        // 2. PKCE code exchange if present in query parameters
        const searchParams = new URLSearchParams(search);
        const code = searchParams.get('code');
        const targetRedirect = getSafeAuthRedirect(searchParams.get('redirect'));

        const oauthError = searchParams.get('error_description') || searchParams.get('error');
        if (oauthError) {
          if (isMounted) {
            setError(oauthError);
          }
          return;
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            const errorMsg = exchangeError.message.toLowerCase();
            const isPkceMissing = errorMsg.includes('code verifier') || errorMsg.includes('pkce');

            if (isMounted) {
              setError(isPkceMissing && isRecovery
                ? 'Your password reset link was opened in a different browser or has expired. Please request a new link from the Forgot Password page.'
                : exchangeError.message);
            }
            return;
          }

          if (isMounted) {
            if (isRecovery) {
              navigate('/auth/reset-password', { replace: true });
            } else {
              navigate(targetRedirect, { replace: true });
            }
          }
          return;
        }

        // 3. Hash fragment session verification
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          if (isMounted) setError(sessionError.message);
          return;
        }

        if (session) {
          if (isMounted) {
            setStatusText('Verification complete! Redirecting...');
            setTimeout(() => {
              navigate(targetRedirect, { replace: true });
            }, 600);
          }
        } else {
          // If no session found after brief delay, redirect to sign in
          setTimeout(() => {
            if (isMounted) navigate('/signin', { replace: true });
          }, 1200);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Authentication verification failed.');
        }
      }
    }

    void handleCallback();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="py-12 max-w-md mx-auto w-full px-4">
      <div className="text-center mb-6">
        <Link to="/" aria-label="CircleUp Home" className="inline-block">
          <img src={circleUpLogo} alt="CircleUp" className="h-12 w-auto mx-auto object-contain dark:brightness-0 dark:invert" />
        </Link>
      </div>

      <div className="w-full bg-card border border-foreground/15 p-6 sm:p-8 shadow-sm text-center space-y-5">
        {error ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-7" />
            </div>
            <h1 className="font-display text-2xl text-cocoa">Verification Notice</h1>
            <p className="text-xs text-destructive leading-relaxed">{error}</p>
            <div className="pt-3 flex flex-col gap-2">
              <Link
                to="/signin"
                className="inline-block bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep"
              >
                Return to Sign In
              </Link>
              <Link
                to="/forgot-password"
                className="text-xs text-cocoa underline underline-offset-4 hover:text-primary"
              >
                Request a New Reset Link
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="size-7 animate-spin" />
            </div>
            <h1 className="font-display text-2xl text-cocoa">Authenticating</h1>
            <p className="text-xs text-terracotta tracking-wider uppercase">{statusText}</p>
          </>
        )}
      </div>
    </div>
  );
}
