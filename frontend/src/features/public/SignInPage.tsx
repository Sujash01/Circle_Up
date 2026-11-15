import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
import { authService } from '@/services/authService';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/account';

  useEffect(() => {
    document.title = 'Sign In — CircleUp';
    let metaTag = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let created = false;
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.name = 'robots';
      document.head.appendChild(metaTag);
      created = true;
    }
    const previous = metaTag.content;
    metaTag.content = 'noindex, follow';

    return () => {
      if (created && metaTag) {
        document.head.removeChild(metaTag);
      } else if (metaTag) {
        metaTag.content = previous || 'index, follow';
      }
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setFeedback({
        type: 'success',
        message: 'Your email has been verified successfully! Please sign in with your credentials to continue.',
      });
    }
  }, [searchParams]);

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    const trimmed = email.trim();

    if (!trimmed) {
      errs.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      errs.email = 'Please enter a valid email address (e.g. name@domain.com).';
    }

    if (!password) {
      errs.password = 'Please enter your password.';
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErrors({});
    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await authService.signIn({ email, password });
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Signed in successfully! Welcome back to CircleUp.',
        });

        setTimeout(() => {
          navigate(redirectTarget);
        }, 600);
      } else {
        const msg = res.message || 'Unable to sign in. Please verify your credentials.';
        setErrors({ general: msg });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setErrors({ general: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="py-6 sm:py-12 max-w-md mx-auto w-full">
      {/* Editorial Header */}
      <div className="text-center space-y-3 mb-8">
        <Link to="/" aria-label="CircleUp Home" className="inline-block transition-transform hover:scale-105">
          <img
            src={circleUpLogo}
            alt="CircleUp"
            className="h-14 sm:h-16 w-auto mx-auto object-contain dark:brightness-0 dark:invert"
          />
        </Link>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.22em] text-terracotta font-semibold">
            Member Access
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight mt-1">
            Sign In to CircleUp
          </h1>
        </div>
        <p className="text-xs text-foreground/75 max-w-xs mx-auto leading-relaxed">
          Access your saved rails, wishlist, bag, and curated orders.
        </p>
      </div>

      {/* Main Form Container */}
      <div className="bg-card border border-foreground/15 p-7 sm:p-9 shadow-sm relative space-y-6">
        {/* Feedback Messages */}
        {feedback && (
          <div className="flex items-start gap-2.5 bg-primary/10 border border-primary/25 p-3.5 text-xs text-cocoa">
            <CheckCircle2 className="size-4 shrink-0 text-primary mt-0.5" />
            <span className="leading-relaxed font-medium">{feedback.message}</span>
          </div>
        )}

        {errors.general && (
          <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/25 p-3.5 text-xs text-destructive">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errors.general}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email input */}
          <div className="space-y-1.5">
            <label htmlFor="signin-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
              Email Address *
            </label>
            <div className="relative">
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                disabled={isLoading}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="name@domain.com"
                className={`w-full border bg-transparent py-2.5 pl-9 pr-3 text-sm text-cocoa placeholder:text-muted-foreground/60 transition-colors focus:outline-none ${
                  errors.email ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                }`}
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
            {errors.email && <p className="text-[0.72rem] text-destructive">{errors.email}</p>}
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="signin-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Password *
              </label>
              <Link
                to="/forgot-password"
                className="text-[0.72rem] text-terracotta underline underline-offset-4 hover:text-primary"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="signin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                disabled={isLoading}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder="••••••••"
                className={`w-full border bg-transparent py-2.5 pl-9 pr-10 text-sm text-cocoa placeholder:text-muted-foreground/60 transition-colors focus:outline-none ${
                  errors.password ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                }`}
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && <p className="text-[0.72rem] text-destructive">{errors.password}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-primary py-3.5 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50 mt-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In to Account</span>
            )}
          </button>
        </form>

        {/* Switch to Sign Up */}
        <div className="border-t border-foreground/15 pt-5 text-center">
          <p className="text-xs text-foreground/75">
            Don't have a CircleUp account yet?{' '}
            <Link
              to={redirectTarget ? `/signup?redirect=${encodeURIComponent(redirectTarget)}` : '/signup'}
              className="font-semibold text-cocoa underline underline-offset-4 hover:text-primary"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
