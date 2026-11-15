import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Mail, ShieldAlert } from 'lucide-react';
import { authService } from '@/services/authService';
import circleUpLogo from '@/assets/circle-up-logo.png';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    document.title = 'Forgot Password — CircleUp';
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await authService.requestPasswordReset(trimmed);
      if (res.success) {
        setIsSubmitted(true);
      } else {
        setError(res.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to process password reset request.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="border border-foreground/15 bg-card p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col items-center text-center space-y-2">
          <Link to="/" className="inline-block transition-transform duration-300 hover:scale-[1.03]">
            <img src={circleUpLogo} alt="CircleUp Logo" className="h-10 w-auto object-contain" />
          </Link>
          <p className="text-[0.7rem] uppercase tracking-[0.22em] text-terracotta font-semibold">
            Password Recovery
          </p>
          <h1 className="font-display text-2xl sm:text-3xl text-cocoa">Forgot Password</h1>
          <p className="text-xs text-foreground/75 max-w-xs leading-relaxed">
            Enter the email address registered with your account, and we will send you a link to reset your password.
          </p>
        </div>

        {isSubmitted ? (
          <div className="border border-primary/25 bg-secondary/50 p-6 text-center space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="font-display text-xl text-cocoa">Check Your Email</h2>
            <p className="text-xs text-foreground/80 leading-relaxed">
              We have sent a password reset link to <strong className="font-semibold text-cocoa">{email}</strong>. Please check your inbox and spam folder.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="text-xs text-terracotta underline underline-offset-4 hover:text-primary"
              >
                Send to a different email
              </button>
              <Link
                to="/signin"
                className="mt-2 block bg-primary py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/25 p-3 text-xs text-destructive">
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="recovery-email" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full border border-foreground/20 bg-transparent py-2.5 pl-9 pr-3 text-sm text-cocoa placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50"
            >
              {isLoading ? 'Sending Reset Link...' : 'Send Reset Link'}
            </button>

            <div className="text-center pt-2">
              <Link
                to="/signin"
                className="text-xs text-terracotta underline underline-offset-4 hover:text-primary"
              >
                Remembered your password? Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
