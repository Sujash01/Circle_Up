import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { authService } from '@/services/authService';
import circleUpLogo from '@/assets/circle-up-logo.png';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Reset Password — CircleUp';
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Please enter a new password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please retype carefully.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await authService.updatePassword(password);
      if (res.success) {
        setIsSuccess(true);
      } else {
        setError(res.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
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
            Account Security
          </p>
          <h1 className="font-display text-2xl sm:text-3xl text-cocoa">Create New Password</h1>
          <p className="text-xs text-foreground/75 max-w-xs leading-relaxed">
            Please choose a secure new password for your CircleUp account.
          </p>
        </div>

        {isSuccess ? (
          <div className="border border-primary/25 bg-secondary/50 p-6 text-center space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="font-display text-xl text-cocoa">Password Updated</h2>
            <p className="text-xs text-foreground/80 leading-relaxed">
              Your password has been successfully reset. You can now access your account with your new credentials.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="w-full bg-primary py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep"
              >
                Go to My Account
              </button>
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
              <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full border border-foreground/20 bg-transparent py-2.5 pl-3 pr-10 text-sm text-cocoa placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="confirm-new-password" className="block text-xs font-semibold uppercase tracking-wider text-cocoa">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full border border-foreground/20 bg-transparent py-2.5 pl-3 pr-10 text-sm text-cocoa placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-forest-deep disabled:opacity-50"
            >
              {isLoading ? 'Updating Password...' : 'Save New Password'}
            </button>

            <div className="text-center pt-2">
              <Link
                to="/signin"
                className="text-xs text-terracotta underline underline-offset-4 hover:text-primary"
              >
                Return to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
