import { CheckCircle2, Eye, EyeOff, Lock, Mail, Phone, ShieldAlert, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
import { authService } from '@/services/authService';

export function SignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
    general?: string;
  }>({});

  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/';

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErrors({});

    if (!validate()) return;

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
        }, 1200);
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

      {/* Main Form */}
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
          <div role="status" className="p-3 bg-primary/10 border border-primary/25 text-primary text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Full Name */}
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
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
              />
            </div>
            {errors.fullName && (
              <p id="signup-name-error" className="text-xs text-destructive mt-1 font-medium">
                {errors.fullName}
              </p>
            )}
          </div>

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
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
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
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
              />
            </div>
            {errors.phone && (
              <p id="signup-phone-error" className="text-xs text-destructive mt-1 font-medium">
                {errors.phone}
              </p>
            )}
          </div>

          {/* Password & Confirm Password side by side */}
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
                  className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
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
                  className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent border border-foreground/25 focus:border-primary focus:outline-none transition-colors text-cocoa placeholder:text-muted-foreground"
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
            disabled={isLoading}
            className="w-full mt-2 bg-primary py-3 px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>

        {/* Footer redirection with prominent Sign In button */}
        <div className="border-t border-foreground/15 pt-5 text-center space-y-3">
          <p className="text-xs text-foreground/80">
            Already have a CircleUp account?
          </p>
          <Link
            to={redirectTarget !== '/' ? `/signin?redirect=${encodeURIComponent(redirectTarget)}` : '/signin'}
            className="inline-flex min-h-[42px] w-full items-center justify-center rounded-full border-2 border-foreground/25 bg-card/80 py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-cocoa transition-all hover:border-primary hover:text-primary hover:bg-forest/5 shadow-xs"
          >
            Sign In to Existing Account →
          </Link>
        </div>
      </div>
    </div>
  );
}

