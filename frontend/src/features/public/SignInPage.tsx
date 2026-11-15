import { CheckCircle2, Eye, EyeOff, Lock, Mail, Phone, ShieldAlert, Sparkles } from 'lucide-react';
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

export function SignInPage() {
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [errors, setErrors] = useState<{ email?: string; phone?: string; otp?: string; password?: string; general?: string }>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/';

  useEffect(() => {
    document.title = 'Sign In — CircleUp';
    // Add meta robots noindex to prevent indexing auth pages
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
    if (!email.trim()) {
      errs.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
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

  const validatePhone = () => {
    const errs: { phone?: string; otp?: string } = {};
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone) {
      errs.phone = 'Please enter your mobile phone number.';
    } else if (!/^\+?[0-9]{10,13}$/.test(cleanPhone)) {
      errs.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (otpSent && !otp.trim()) {
      errs.otp = 'Please enter the 4-digit verification code.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setFeedback(null);
    setErrors({});

    try {
      const res = await authService.signInWithGoogle();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Signed in with Google! Welcome back to CircleUp.',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 800);
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

    if (!validatePhone()) return;

    if (!otpSent) {
      await handleSendOtp();
      return;
    }

    setIsLoading(true);
    try {
      const res = await authService.verifyPhoneOtp(phone, otp);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Phone verified! Welcome back to your CircleUp wardrobe.',
        });
        setTimeout(() => {
          navigate(redirectTarget);
        }, 800);
      } else {
        setErrors({ otp: res.message || 'Invalid code. Use demo code 1234.' });
      }
    } catch {
      setErrors({ general: 'Verification error occurred. Please try again.' });
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
      const res = await authService.signIn({ email, password, rememberMe });
      if (res.success) {
        setFeedback({
          type: res.isDemo ? 'info' : 'success',
          message: res.message || 'Welcome back to CircleUp!',
        });

        setTimeout(() => {
          navigate(redirectTarget);
        }, 900);
      } else {
        setErrors({ general: res.message || 'Unable to sign in. Please verify your credentials.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setErrors({ general: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) return;
    await authService.requestPasswordReset(forgotEmail);
    setForgotSent(true);
  };

  return (
    <div className="py-6 sm:py-12 max-w-md mx-auto">
      {/* Editorial Header */}
      <div className="text-center space-y-3 mb-8">
        <Link to="/" aria-label="CircleUp Home" className="inline-block transition-transform hover:scale-105">
          <img src={circleUpLogo} alt="CircleUp" className="h-14 sm:h-16 w-auto mx-auto object-contain dark:brightness-0 dark:invert" />
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
        {/* Notice of Frontend Mode */}
        <div className="flex items-start gap-2.5 bg-secondary/50 border border-foreground/10 p-3 text-[0.72rem] text-foreground/80 leading-relaxed">
          <ShieldAlert className="size-4 text-terracotta shrink-0 mt-0.5" />
          <p>
            <strong>Frontend Simulation:</strong> CircleUp authentication is modular and connects to
            the backend when deployed. No passwords are stored in plaintext.
          </p>
        </div>

        {errors.general && (
          <div role="alert" className="p-3 bg-destructive/10 border border-destructive/25 text-destructive text-xs font-medium">
            {errors.general}
          </div>
        )}

        {feedback && (
          <div role="status" className="p-3 bg-primary/10 border border-primary/25 text-primary text-xs font-semibold">
            {feedback.message}
          </div>
        )}

        {/* Quick Google Sign In */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-full border-2 border-foreground/20 hover:border-primary/60 bg-card hover:bg-card/90 text-xs font-bold text-cocoa transition-all shadow-xs hover:shadow-sm"
          >
            {isGoogleLoading ? (
              <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <GoogleIcon className="size-4" />
            )}
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-foreground/15 w-full" />
            <span className="bg-card px-3 text-[0.68rem] uppercase tracking-widest text-terracotta font-bold shrink-0">
              or with credentials
            </span>
            <div className="border-t border-foreground/15 w-full" />
          </div>
        </div>

        {/* Method Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-secondary/50 border border-foreground/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email');
              setErrors({});
            }}
            className={`py-1.5 px-3 rounded-full transition-all text-center ${
              authMethod === 'email'
                ? 'bg-primary text-primary-foreground shadow-xs'
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
            className={`py-1.5 px-3 rounded-full transition-all text-center flex items-center justify-center gap-1.5 ${
              authMethod === 'phone'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-cocoa/70 hover:text-cocoa'
            }`}
          >
            <Phone className="size-3" />
            <span>Phone OTP</span>
          </button>
        </div>

        {/* Email & Password Form */}
        {authMethod === 'email' && (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email field */}
            <div className="space-y-1.5">
              <label htmlFor="signin-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Email Address <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  id="signin-email"
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
                  aria-describedby={errors.email ? 'signin-email-error' : undefined}
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
                />
              </div>
              {errors.email && (
                <p id="signin-email-error" className="text-xs text-destructive mt-1 font-medium">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="signin-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                  Password <span className="text-destructive">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(true);
                    setForgotSent(false);
                    setForgotEmail(email);
                  }}
                  className="text-[0.72rem] text-terracotta hover:text-primary transition-colors underline underline-offset-2"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  id="signin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'signin-password-error' : undefined}
                  className="w-full pl-9 pr-10 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="signin-password-error" className="text-xs text-destructive mt-1 font-medium">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="size-4 rounded-none accent-primary border-foreground/30 focus:ring-primary"
              />
              <label htmlFor="remember-me" className="text-xs text-foreground/80 cursor-pointer select-none">
                Stay signed in on this browser
              </label>
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-primary py-3 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        )}

        {/* Phone OTP Form */}
        {authMethod === 'phone' && (
          <form onSubmit={handlePhoneSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signin-phone" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Mobile Number <span className="text-destructive">*</span>
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
                  className="w-full pl-12 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
                />
              </div>
              {errors.phone && (
                <p className="text-xs text-destructive mt-1 font-medium">{errors.phone}</p>
              )}
            </div>

            {otpSent && (
              <div className="space-y-1.5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label htmlFor="signin-otp" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                    Verification Code (OTP) <span className="text-destructive">*</span>
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
                  placeholder="1234"
                  className="w-full px-3 py-2.5 text-center text-lg tracking-[0.3em] font-mono font-bold bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
                />
                {errors.otp && (
                  <p className="text-xs text-destructive mt-1 font-medium">{errors.otp}</p>
                )}
                <p className="text-[0.68rem] text-muted-foreground">
                  CircleUp simulation: Enter demo OTP code <strong>1234</strong> to authenticate.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-primary py-3 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : otpSent ? (
                <span>Verify & Sign In</span>
              ) : (
                <span>Send Verification OTP</span>
              )}
            </button>
          </form>
        )}

        {/* 1-Click Demo Customer Fill */}
        <div className="pt-2 border-t border-foreground/15 text-center space-y-2">
          <p className="text-[0.68rem] uppercase font-bold tracking-wider text-terracotta">
            Quick Testing
          </p>
          <button
            type="button"
            onClick={() => {
              setEmail('aanya@example.com');
              setPassword('CustomerPass123');
              setErrors({});
            }}
            className="w-full py-2 px-3 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs font-semibold text-primary transition-colors text-center"
          >
            Fill Demo Customer (Aanya Sharma)
          </button>
        </div>

        {/* Footer redirection */}
        <div className="border-t border-foreground/15 pt-5 text-center text-xs text-foreground/80">
          <span>New to CircleUp? </span>
          <Link
            to={redirectTarget !== '/' ? `/signup?redirect=${encodeURIComponent(redirectTarget)}` : '/signup'}
            className="font-semibold text-primary hover:underline underline-offset-4"
          >
            Create an Account →
          </Link>
        </div>
      </div>

      {/* Forgot Password Light Modal */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reset Password"
          className="fixed inset-0 z-50 bg-[#14281a]/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowForgotModal(false)}
        >
          <div
            className="bg-card border-2 border-foreground/20 p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl text-cocoa">Reset Password</h2>
            {forgotSent ? (
              <div className="space-y-4">
                <p className="text-xs text-foreground/80 leading-relaxed">
                  If an account is associated with <strong>{forgotEmail}</strong>, password reset
                  instructions have been dispatched.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full bg-primary py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-foreground/80 leading-relaxed">
                  Enter your email address to receive password reset link instructions.
                </p>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none text-cocoa"
                />
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="border border-foreground/25 px-4 py-2 text-xs text-cocoa hover:border-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground"
                  >
                    Send Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

