import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Phone, ShieldAlert, Sparkles, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
import { authService } from '@/services/authService';

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

export function SignUpPage() {
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    otp?: string;
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

  const validateEmailForm = () => {
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

  const validatePhoneForm = () => {
    const errs: typeof errors = {};
    const trimmedName = fullName.trim();
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');

    if (!trimmedName) {
      errs.fullName = 'Please enter your full name.';
    } else if (trimmedName.length < 2) {
      errs.fullName = 'Name must be at least 2 characters.';
    }

    if (!cleanPhone) {
      errs.phone = 'Please enter your mobile phone number.';
    } else if (!/^\+?[0-9]{10,13}$/.test(cleanPhone)) {
      errs.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (otpSent && !otp.trim()) {
      errs.otp = 'Please enter the 4-digit verification code.';
    }

    if (!termsAgreed) {
      errs.terms = 'Please accept the CircleUp community and privacy terms.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    setFeedback(null);
    setErrors({});

    try {
      const res = await authService.signInWithGoogle();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Signed in with Google! Welcome to CircleUp.',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 500);
      } else {
        setErrors({ general: res.message || 'Google sign-up could not be completed.' });
      }
    } catch {
      setErrors({ general: 'Google sign-up could not be completed. Please try again.' });
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
      setOtpSent(true);
      setOtp('1234');
      setFeedback({
        type: 'info',
        message: `${res.message} (Demo code 1234 pre-filled for convenience)`,
      });
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

    if (!validatePhoneForm()) return;

    if (!otpSent) {
      await handleSendOtp();
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phone.trim().replace(/[\s-]/g, '');
      const res = await authService.verifyPhoneOtp(cleanPhone, otp.trim(), fullName.trim());
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Account created with phone number! Welcome to CircleUp.',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 500);
      } else {
        setErrors({ general: res.message || 'Invalid verification code.' });
      }
    } catch {
      setErrors({ general: 'Failed to complete registration. Please retry.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErrors({});

    if (!validateEmailForm()) return;

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

        {/* Google One-Click Sign Up */}
        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={isGoogleLoading || isLoading}
          className="w-full flex items-center justify-center gap-3 border border-foreground/25 bg-card hover:bg-forest/5 py-3 px-4 text-xs font-bold uppercase tracking-wider text-cocoa transition-all shadow-xs cursor-pointer disabled:opacity-60"
        >
          {isGoogleLoading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <GoogleIcon className="size-4.5" />
          )}
          <span>Sign Up with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-px flex-1 bg-foreground/15" />
          <span className="text-[0.68rem] uppercase tracking-widest font-semibold">Or register with</span>
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

        {/* Phone Registration Form */}
        {authMethod === 'phone' && (
          <form onSubmit={handlePhoneSubmit} noValidate className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="signup-phone-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Full Name *
              </label>
              <div className="relative">
                <input
                  id="signup-phone-name"
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

            {/* Mobile Number */}
            <div className="space-y-1.5">
              <label htmlFor="signup-phone" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Mobile Number *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground select-none pointer-events-none">
                  +91
                </span>
                <input
                  id="signup-phone"
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

            {/* Verification OTP */}
            {otpSent && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="signup-otp" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
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
                <div className="relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-primary pointer-events-none" />
                  <input
                    id="signup-otp"
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value);
                      if (errors.otp) setErrors((prev) => ({ ...prev, otp: undefined }));
                    }}
                    placeholder="1234"
                    className={`w-full pl-9 pr-3 py-2.5 text-center text-lg tracking-[0.3em] font-mono font-bold bg-transparent border transition-colors text-cocoa placeholder:text-muted-foreground/60 focus:outline-none ${
                      errors.otp ? 'border-destructive focus:border-destructive' : 'border-foreground/25 focus:border-primary'
                    }`}
                  />
                </div>
                {errors.otp && <p className="text-[0.72rem] text-destructive">{errors.otp}</p>}
                <p className="text-[0.68rem] text-muted-foreground">
                  CircleUp verification: Enter demo OTP code <strong>1234</strong> to verify and create account.
                </p>
              </div>
            )}

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
              className="w-full flex items-center justify-center gap-2 bg-primary py-3.5 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50 mt-4 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{otpSent ? 'Verifying Phone...' : 'Sending Code...'}</span>
                </>
              ) : otpSent ? (
                <span>Verify &amp; Create Account</span>
              ) : (
                <span>Send Verification Code</span>
              )}
            </button>
          </form>
        )}

        {/* Email Registration Form */}
        {authMethod === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
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
              className="w-full flex items-center justify-center gap-2 bg-primary py-3.5 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50 mt-6 cursor-pointer"
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
        )}

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
