import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Phone, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
import { authService, getSafeAuthRedirect } from '@/services/authService';

function GoogleIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2c0 2.8.7 5.5 1.9 7.8l3.7-3z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
      />
    </svg>
  );
}

export function SignInPage() {
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [errors, setErrors] = useState<{
    email?: string;
    phone?: string;
    otp?: string;
    password?: string;
    general?: string;
  }>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = getSafeAuthRedirect(searchParams.get('redirect'));

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

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setFeedback(null);
    setErrors({});

    try {
      const res = await authService.signInWithGoogle({ redirectTarget });
      if (res.success) {
        setFeedback({ type: 'info', message: 'Connecting to Google...' });
      } else {
        setErrors({ general: res.message || 'Google sign-in could not be completed.' });
      }
    } catch {
      setErrors({ general: 'Google sign-in could not be completed. Please try again.' });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSendOtp = async () => {
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone || !/^\+?[0-9]{10,13}$/.test(cleanPhone)) {
      setErrors({ phone: 'Please enter a valid 10-digit mobile number first.' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    setErrors({});

    try {
      const res = await authService.sendPhoneOtp(cleanPhone);
      if (!res.success) {
        setErrors({ general: res.message || 'Failed to send verification code.' });
        return;
      }
      setOtpSent(true);
      setFeedback({ type: 'info', message: res.message });
    } catch {
      setErrors({ general: 'Failed to send OTP code. Please retry.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErrors({});

    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone || !/^\+?[0-9]{10,13}$/.test(cleanPhone)) {
      setErrors({ phone: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    if (!otpSent) {
      await handleSendOtp();
      return;
    }

    if (!otp.trim()) {
      setErrors({ otp: 'Please enter the 4-digit verification code.' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await authService.verifyPhoneOtp(cleanPhone, otp.trim());
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Phone verified successfully! Redirecting to your account...',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 500);
      } else {
        setErrors({ general: res.message || 'Invalid verification code.' });
      }
    } catch {
      setErrors({ general: 'Failed to verify OTP. Please try again.' });
    } finally {
      setIsLoading(false);
    }
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
        }, 500);
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

        {/* Google One-Click Sign In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isLoading}
          className="w-full flex items-center justify-center gap-3 border border-foreground/25 bg-card hover:bg-forest/5 py-3 px-4 text-xs font-bold uppercase tracking-wider text-cocoa transition-all shadow-xs cursor-pointer disabled:opacity-60"
        >
          {isGoogleLoading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <GoogleIcon className="size-4.5" />
          )}
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-px flex-1 bg-foreground/15" />
          <span className="text-[0.68rem] uppercase tracking-widest font-semibold">Or sign in with</span>
          <div className="h-px flex-1 bg-foreground/15" />
        </div>

        {/* Method Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-secondary/60 rounded-lg border border-foreground/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email');
              setErrors({});
            }}
            className={`py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              authMethod === 'email'
                ? 'bg-card text-cocoa shadow-xs font-bold'
                : 'text-muted-foreground hover:text-cocoa'
            }`}
          >
            <Mail className="size-3.5" />
            <span>Email Address</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('phone');
              setErrors({});
            }}
            className={`py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              authMethod === 'phone'
                ? 'bg-card text-cocoa shadow-xs font-bold'
                : 'text-muted-foreground hover:text-cocoa'
            }`}
          >
            <Phone className="size-3.5" />
            <span>Mobile Phone (OTP)</span>
          </button>
        </div>

        {/* Phone OTP Form */}
        {authMethod === 'phone' && (
          <form onSubmit={handlePhoneSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signin-phone" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Mobile Number *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground select-none pointer-events-none">
                  +91
                </span>
                <input
                  id="signin-phone"
                  type="tel"
                  autoComplete="tel-national"
                  required
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder="98765 43210"
                  className={`w-full pl-12 pr-3 py-2.5 text-sm bg-transparent border transition-colors text-cocoa placeholder:text-muted-foreground/60 focus:outline-none ${
                    errors.phone ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                  }`}
                />
              </div>
              {errors.phone && <p className="text-[0.72rem] text-destructive">{errors.phone}</p>}
            </div>

            {otpSent && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="signin-otp" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                    Verification Code (OTP) *
                  </label>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="text-[0.72rem] text-terracotta hover:text-primary transition-colors underline"
                  >
                    Resend code
                  </button>
                </div>
                <input
                  id="signin-otp"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value);
                    if (errors.otp) setErrors((prev) => ({ ...prev, otp: undefined }));
                  }}
                  placeholder="Code"
                  className={`w-full px-3 py-2.5 text-center text-lg tracking-[0.3em] font-mono font-bold bg-transparent border transition-colors text-cocoa placeholder:text-muted-foreground/60 focus:outline-none ${
                    errors.otp ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                  }`}
                />
                {errors.otp && <p className="text-[0.72rem] text-destructive">{errors.otp}</p>}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-primary py-3.5 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50 mt-4 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{otpSent ? 'Verifying OTP...' : 'Sending Code...'}</span>
                </>
              ) : otpSent ? (
                <span>Verify &amp; Sign In</span>
              ) : (
                <span>Send Verification OTP</span>
              )}
            </button>
          </form>
        )}

        {/* Email Password Form */}
        {authMethod === 'email' && (
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
              className="w-full flex items-center justify-center gap-2 bg-primary py-3.5 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50 mt-6 cursor-pointer"
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
        )}

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
