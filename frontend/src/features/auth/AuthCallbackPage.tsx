import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import circleUpLogo from '@/assets/circle-up-logo.png';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Verifying your session...');
  const [isEmailConfirmed, setIsEmailConfirmed] = useState(false);

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

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            const errorMsg = exchangeError.message.toLowerCase();
            const isPkceMissing = errorMsg.includes('code verifier') || errorMsg.includes('pkce');

            if (isPkceMissing) {
              if (isRecovery) {
                if (isMounted) {
                  setError(
                    'Your password reset link was opened in a different browser or has expired. Please request a new link from the Forgot Password page.',
                  );
                }
                return;
              }

              // In Supabase, the email confirmation link was already validated on the Supabase Auth server!
              // The missing PKCE verifier only prevents auto-session creation on external/separate browser sessions.
              // The account is already verified and the user simply needs to sign in.
              if (isMounted) {
                setIsEmailConfirmed(true);
                setStatusText('Email confirmed! Redirecting to sign in...');
                setTimeout(() => {
                  navigate('/signin?verified=true', { replace: true });
                }, 2400);
              }
              return;
            }

            if (isMounted) setError(exchangeError.message);
            return;
          }

          if (isMounted) {
            if (isRecovery) {
              navigate('/auth/reset-password', { replace: true });
            } else {
              navigate('/account', { replace: true });
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
              navigate('/account', { replace: true });
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
        {isEmailConfirmed ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-7" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-cocoa">Email Confirmed!</h1>
            <p className="text-xs text-foreground/85 leading-relaxed max-w-sm mx-auto">
              Your CircleUp account has been verified successfully. Because the confirmation link was opened from an external application or new browser window, please sign in with your email and password to access your account.
            </p>
            <div className="pt-2">
              <Link
                to="/signin?verified=true"
                className="inline-block bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
              >
                Sign In to CircleUp
              </Link>
            </div>
          </>
        ) : error ? (
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
