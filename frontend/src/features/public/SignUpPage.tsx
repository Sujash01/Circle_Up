import { CheckCircle2, Eye, EyeOff, Lock, Mail, Phone, ShieldAlert, Sparkles, User } from 'lucide-react';
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
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

    if (!fullName.trim()) {
      errs.fullName = 'Please enter your full name.';
    } else if (fullName.trim().length < 2) {
      errs.fullName = 'Name must be at least 2 characters.';
    }

    if (!email.trim()) {
      errs.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please enter a valid email address (e.g. name@domain.com).';
    }

    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone) {
      errs.phone = 'Please enter your mobile phone number.';
    } else if (!/^\+?[0-9]{10,13}$/.test(cleanPhone)) {
      errs.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (!password) {
      errs.password = 'Please create a password.';
    } else if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters long.';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    if (!termsAgreed) {
      errs.terms = 'Please accept the CircleUp community and privacy principles.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validatePhoneForm = () => {
    const errs: typeof errors = {};
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');

    if (!cleanPhone) {
      errs.phone = 'Please enter your mobile phone number.';
    } else if (!/^\+?[0-9]{10,13}$/.test(cleanPhone)) {
      errs.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (!fullName.trim()) {
      errs.fullName = 'Please enter your full name.';
    }

    if (otpSent && !otp.trim()) {
      errs.otp = 'Please enter the 4-digit verification code sent to your phone.';
    }

    if (!termsAgreed) {
      errs.terms = 'Please accept the CircleUp community and privacy principles.';
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
          message: 'Signed in with Google! Redirecting to your circular wardrobe profile...',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 800);
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
    setErrors({});
    setIsLoading(true);
    try {
      const res = await authService.sendPhoneOtp(cleanPhone);
      setOtpSent(true);
      setOtp('1234'); // Auto-fill demo OTP for effortless review
      setFeedback({
        type: 'info',
        message: `${res.message} (Demo code 1234 pre-filled for convenience)`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErrors({});

    if (authMethod === 'phone') {
      if (!validatePhoneForm()) return;
      if (!otpSent) {
        await handleSendOtp();
        return;
      }

      setIsLoading(true);
      try {
        const res = await authService.verifyPhoneOtp(phone, otp, fullName);
        if (res.success) {
          setFeedback({
            type: 'success',
            message: 'Phone verified! Welcome to CircleUp.',
          });
          setTimeout(() => {
            navigate(redirectTarget);
          }, 900);
        } else {
          setErrors({ otp: res.message });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An error occurred during phone verification.';
        setErrors({ general: msg });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Email Registration
    if (!validateEmailForm()) return;

    setIsLoading(true);
    try {
      const res = await authService.signUp({ fullName, email, phone, password });
      if (res.success) {
        setFeedback({
          type: res.isDemo ? 'info' : 'success',
          message: res.message || 'Account created successfully! Welcome to CircleUp.',
        });

        setTimeout(() => {
          navigate(redirectTarget);
        }, 900);
      } else {
        setErrors({ general: res.message || 'Registration could not be completed.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during signup.';
      setErrors({ general: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="py-6 sm:py-12 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-3 mb-8">
        <Link to="/" aria-label="CircleUp Home" className="inline-block transition-transform hover:scale-105">
          <img src={circleUpLogo} alt="CircleUp" className="h-14 sm:h-16 w-auto mx-auto object-contain dark:brightness-0 dark:invert" />
        </Link>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.22em] text-terracotta font-semibold">
            Join the Community
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-cocoa leading-tight mt-1">
            Create Your CircleUp Account
          </h1>
        </div>
        <p className="text-xs text-foreground/75 max-w-sm mx-auto leading-relaxed">
          Save 1-of-1 vintage pieces, request rentals, track sustainable packaging orders, and join The Social Circle.
        </p>
      </div>

      {/* Main Container */}
      <div className="bg-card border border-foreground/15 p-6 sm:p-9 shadow-sm relative space-y-6 rounded-2xl">
        {/* Notice of Frontend Mode */}
        <div className="flex items-start gap-2.5 bg-secondary/50 border border-foreground/10 p-3 text-[0.72rem] text-foreground/80 leading-relaxed rounded-lg">
          <ShieldAlert className="size-4 text-terracotta shrink-0 mt-0.5" />
          <p>
            <strong>Frontend Simulation:</strong> CircleUp authentication is modular and connects to
            the backend when deployed. No passwords are stored in plaintext.
          </p>
        </div>

        {errors.general && (
          <div role="alert" className="p-3 bg-destructive/10 border border-destructive/25 text-destructive text-xs font-medium rounded-lg">
            {errors.general}
          </div>
        )}

        {feedback && (
          <div role="status" className="p-3 bg-primary/10 border border-primary/25 text-primary text-xs font-semibold flex items-center gap-2 rounded-lg">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}

        {/* 1. Continue with Google Button */}
        <div>
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isGoogleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-card border-2 border-foreground/20 hover:border-foreground/40 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-cocoa transition-all hover:bg-forest/5 shadow-xs disabled:opacity-60"
          >
            {isGoogleLoading ? (
              <span className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <GoogleIcon className="size-5" />
            )}
            <span>Sign up with Google</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-foreground/15" />
          <span className="absolute bg-card px-3 text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
            or continue with
          </span>
        </div>

        {/* Method Toggle: Email vs Phone */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/40 border border-foreground/10 rounded-xl text-xs font-bold uppercase tracking-wider text-center">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email');
              setErrors({});
            }}
            className={`py-2 px-3 rounded-lg transition-all ${
              authMethod === 'email'
                ? 'bg-card text-primary shadow-xs border border-foreground/15'
                : 'text-cocoa/70 hover:text-cocoa'
            }`}
          >
            Email & Password
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('phone');
              setErrors({});
            }}
            className={`py-2 px-3 rounded-lg transition-all ${
              authMethod === 'phone'
                ? 'bg-card text-primary shadow-xs border border-foreground/15'
                : 'text-cocoa/70 hover:text-cocoa'
            }`}
          >
            Phone Number (OTP)
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Full Name (Used by both methods) */}
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
              Full Name <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                }}
                placeholder="Aanya Sharma"
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'signup-name-error' : undefined}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground rounded-lg"
              />
            </div>
            {errors.fullName && (
              <p id="signup-name-error" className="text-xs text-destructive mt-1 font-medium">
                {errors.fullName}
              </p>
            )}
          </div>

          {/* Email Method Fields */}
          {authMethod === 'email' && (
            <>
              {/* Email Address */}
              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Email Address <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="aanya@example.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'signup-email-error' : undefined}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground rounded-lg"
                  />
                </div>
                {errors.email && (
                  <p id="signup-email-error" className="text-xs text-destructive mt-1 font-medium">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Mobile Phone Number */}
              <div className="space-y-1.5">
                <label htmlFor="signup-phone" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Mobile Phone Number <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="signup-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="+91 98201 12233"
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? 'signup-phone-error' : undefined}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground rounded-lg"
                  />
                </div>
                {errors.phone && (
                  <p id="signup-phone-error" className="text-xs text-destructive mt-1 font-medium">
                    {errors.phone}
                  </p>
                )}
              </div>

              {/* Password & Confirm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="signup-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      placeholder="Min. 8 characters"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? 'signup-password-error' : undefined}
                      className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground rounded-lg"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="signup-password-error" className="text-xs text-destructive mt-1 font-medium">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="signup-confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                    Confirm <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }}
                      placeholder="Repeat password"
                      aria-invalid={Boolean(errors.confirmPassword)}
                      aria-describedby={errors.confirmPassword ? 'signup-confirm-error' : undefined}
                      className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground rounded-lg"
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p id="signup-confirm-error" className="text-xs text-destructive mt-1 font-medium">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Phone Method Fields */}
          {authMethod === 'phone' && (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="signup-phone-only" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Mobile Number <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <input
                      id="signup-phone-only"
                      type="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                      placeholder="+91 98201 12233"
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? 'signup-phone-error' : undefined}
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isLoading}
                    className="px-4 py-2.5 rounded-lg bg-secondary border border-foreground/20 text-xs font-bold uppercase tracking-wider text-cocoa hover:bg-forest/10 transition-colors whitespace-nowrap"
                  >
                    {otpSent ? 'Resend' : 'Send OTP'}
                  </button>
                </div>
                {errors.phone && (
                  <p id="signup-phone-error" className="text-xs text-destructive mt-1 font-medium">
                    {errors.phone}
                  </p>
                )}
              </div>

              {otpSent && (
                <div className="space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <label htmlFor="signup-otp" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                      Enter Verification Code <span className="text-destructive">*</span>
                    </label>
                    <span className="text-[0.68rem] text-primary font-semibold">Demo OTP: 1234</span>
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
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-primary/50 focus:border-primary focus:outline-none transition-colors text-cocoa font-mono tracking-widest rounded-lg"
                    />
                  </div>
                  {errors.otp && (
                    <p id="signup-otp-error" className="text-xs text-destructive mt-1 font-medium">
                      {errors.otp}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Terms checkbox */}
          <div className="space-y-1 pt-1">
            <div className="flex items-start gap-2">
              <input
                id="signup-terms"
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="size-4 mt-0.5 rounded-none accent-primary border-foreground/30 focus:ring-primary"
              />
              <label htmlFor="signup-terms" className="text-xs text-foreground/80 cursor-pointer select-none leading-relaxed">
                I agree to CircleUp&apos;s circular fashion &amp; community terms and zero-waste packaging pledge.
              </label>
            </div>
            {errors.terms && <p className="text-xs text-destructive font-medium">{errors.terms}</p>}
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full mt-2 bg-primary py-3 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 rounded-xl"
          >
            {isLoading ? (
              <>
                <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                <span>{authMethod === 'phone' ? 'Verifying Phone...' : 'Creating Account...'}</span>
              </>
            ) : (
              <span>{authMethod === 'phone' ? (otpSent ? 'Verify & Create Account' : 'Send Verification Code') : 'Create Account'}</span>
            )}
          </button>
        </form>

        {/* Footer redirection with Sign In button */}
        <div className="border-t border-foreground/15 pt-5 text-center space-y-3">
          <p className="text-xs text-foreground/80">
            Already have a CircleUp account?
          </p>
          <Link
            to={redirectTarget !== '/account' ? `/signin?redirect=${encodeURIComponent(redirectTarget)}` : '/signin'}
            className="inline-flex min-h-[42px] w-full items-center justify-center rounded-full border-2 border-foreground/25 bg-card/80 py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-cocoa transition-all hover:border-primary hover:text-primary hover:bg-forest/5 shadow-xs"
          >
            Sign In to Existing Account →
          </Link>
        </div>
      </div>
    </div>
  );
}
