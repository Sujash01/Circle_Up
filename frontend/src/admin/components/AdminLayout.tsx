import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminBottomNav } from './AdminBottomNav';
import { AdminHeader } from './AdminHeader';
import { useAdminAuth } from '../context/AdminAuthContext';
import { Clock, Lock } from 'lucide-react';

export function AdminLayout({ children }: { children: ReactNode }) {
  const {
    user,
    sessionExpired,
    sessionWarningRemainingMs,
    renewSession,
    login,
    logout,
  } = useAdminAuth();
  const [renewing, setRenewing] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [reauthing, setReauthing] = useState(false);

  useEffect(() => {
    // Enforce noindex on all admin pages
    let metaRobots = document.querySelector('meta[name="robots"]');
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    const previous = metaRobots.getAttribute('content');
    metaRobots.setAttribute('content', 'noindex, nofollow');

    return () => {
      if (previous) {
        metaRobots?.setAttribute('content', previous);
      } else {
        metaRobots?.remove();
      }
    };
  }, []);

  const handleRenew = async () => {
    setRenewing(true);
    try {
      await renewSession();
    } finally {
      setRenewing(false);
    }
  };

  const handleReauth = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email || !reauthPassword) return;
    setReauthing(true);
    setReauthError('');
    try {
      await login({ email: user.email, password: reauthPassword });
      setReauthPassword('');
    } catch (err: unknown) {
      setReauthError(err instanceof Error ? err.message : 'Unable to sign in. Please check your password.');
    } finally {
      setReauthing(false);
    }
  };

  const warningMinutes =
    sessionWarningRemainingMs !== null
      ? Math.max(1, Math.ceil(sessionWarningRemainingMs / 60_000))
      : null;

  return (
    <div className="min-h-screen bg-[#f8f4e2] text-[#1e2a1c] font-sans flex flex-col md:flex-row antialiased">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-8">
        <AdminHeader />
        {!sessionExpired && warningMinutes !== null && (
          <div
            role="status"
            className="mx-4 sm:mx-8 mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-2 font-medium">
              <Clock className="size-4 text-amber-700 shrink-0" />
              <span>
                Your admin session will expire in about {warningMinutes} minute{warningMinutes === 1 ? '' : 's'} due to inactivity.
              </span>
            </div>
            <button
              type="button"
              disabled={renewing}
              onClick={() => void handleRenew()}
              className="px-3.5 py-1.5 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] font-semibold hover:bg-[#1e2a1c]/90 disabled:opacity-50 transition-colors"
            >
              {renewing ? 'Continuing...' : 'Continue Session'}
            </button>
          </div>
        )}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto" id="admin-main">
          {children}
        </main>
      </div>
      <AdminBottomNav />

      {sessionExpired && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session expired"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-[#1e2a1c]/20 bg-[#f8f4e2] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#1e2a1c]">
              <div className="size-9 rounded-full bg-[#1e2a1c]/10 flex items-center justify-center">
                <Lock className="size-4" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold">Session Expired</h2>
                <p className="text-xs text-[#1e2a1c]/70">
                  Your unsaved form work is preserved. Sign in again to continue.
                </p>
              </div>
            </div>

            <form onSubmit={handleReauth} className="space-y-3">
              <div>
                <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-[#1e2a1c]/75 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  readOnly
                  value={user?.email || ''}
                  className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/15 bg-white/70 text-xs font-medium text-[#1e2a1c]/80"
                />
              </div>
              <div>
                <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-[#1e2a1c]/75 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="Enter your password to resume"
                  className="w-full px-3 py-2 rounded-xl border border-[#1e2a1c]/20 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#1e2a1c]"
                />
              </div>
              {reauthError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {reauthError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="px-4 py-2 rounded-xl border border-[#1e2a1c]/20 text-xs font-semibold text-[#1e2a1c] hover:bg-[#1e2a1c]/5"
                >
                  Sign Out
                </button>
                <button
                  type="submit"
                  disabled={reauthing}
                  className="px-4 py-2 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-semibold hover:bg-[#1e2a1c]/90 disabled:opacity-50"
                >
                  {reauthing ? 'Signing in...' : 'Resume Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
