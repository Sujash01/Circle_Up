import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
import { authService } from '@/services/authService';

export function SignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
    general?: string;
  }>({});

  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/account';

  useEffect(() => {
    document.title = 'Create an Account — CircleUp';
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

  const validate = () => {
    const errs: typeof errors = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      errs.fullName = 'Please enter your full name.';
    } else if (trimmedName.length < 2) {
      errs.fullName = 'Name must be at least 2 characters.';
    }

    if (!trimmedEmail) {
      errs.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = 'Please enter a valid email address (e.g. name@domain.com).';
    }

    if (!password) {
      errs.password = 'Please create a password.';
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters long.';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match. Please retype carefully.';
    }

    if (!termsAgreed) {
      errs.terms = 'Please accept the CircleUp community and privacy terms.';
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
      const res = await authService.signUp({ fullName, email, password });
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Account created successfully! Logging you in...',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 500);
      } else {
        setErrors({ general: res.message || 'Registration could not be completed.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during registration.';
      setErrors({ general: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="py-6 sm:py-12 max-w-md mx-auto w-full">
      {/* Header */}
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
            Join CircleUp
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight mt-1">
            Create Your Account
          </h1>
        </div>
        <p className="text-xs text-foreground/75 max-w-xs mx-auto leading-relaxed">
          Join our community for circular fashion, rental rails, and curated thrift treasures.
        </p>
      </div>

      {/* Main Container */}
      <div className="bg-card border border-foreground/15 p-7 sm:p-9 shadow-sm relative space-y-6">
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
              {/* Full Name */}
              <div className="space-y-1.5">
                <label htmlFor="signup-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Full Name *
                </label>
                <div className="relative">
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    disabled={isLoading}
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                    }}
                    placeholder="e.g. Aanya Sharma"
                    className={`w-full border bg-transparent py-2.5 pl-9 pr-3 text-sm text-cocoa placeholder:text-muted-foreground/60 transition-colors focus:outline-none ${
                      errors.fullName ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                    }`}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                </div>
                {errors.fullName && <p className="text-[0.72rem] text-destructive">{errors.fullName}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Email Address *
                </label>
                <div className="relative">
                  <input
                    id="signup-email"
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

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="signup-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Create Password *
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Minimum 6 characters"
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

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label htmlFor="signup-confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    id="signup-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    disabled={isLoading}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }}
                    placeholder="Re-enter your password"
                    className={`w-full border bg-transparent py-2.5 pl-9 pr-10 text-sm text-cocoa placeholder:text-muted-foreground/60 transition-colors focus:outline-none ${
                      errors.confirmPassword ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                    }`}
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-[0.72rem] text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              {/* Terms Checkbox */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-foreground/80 select-none">
                  <input
                    type="checkbox"
                    checked={termsAgreed}
                    disabled={isLoading}
                    onChange={(e) => {
                      setTermsAgreed(e.target.checked);
                      if (errors.terms) setErrors((prev) => ({ ...prev, terms: undefined }));
                    }}
                    className="mt-0.5 accent-primary rounded size-3.5"
                  />
                  <span className="leading-snug">
                    I agree to CircleUp's{' '}
                    <Link to="/about" className="text-cocoa underline underline-offset-2 hover:text-primary">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link to="/contact" className="text-cocoa underline underline-offset-2 hover:text-primary">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                {errors.terms && <p className="text-[0.72rem] text-destructive mt-1">{errors.terms}</p>}
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
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <span>Create Account</span>
                )}
              </button>
            </form>

        {/* Switch to Sign In */}
        <div className="border-t border-foreground/15 pt-5 text-center">
          <p className="text-xs text-foreground/75">
            Already have an account?{' '}
            <Link
              to={redirectTarget ? `/signin?redirect=${encodeURIComponent(redirectTarget)}` : '/signin'}
              className="font-semibold text-cocoa underline underline-offset-4 hover:text-primary"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
