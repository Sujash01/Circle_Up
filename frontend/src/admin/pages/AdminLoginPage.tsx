import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import { ShieldAlert, Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const { showToast } = useAdminToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both admin email and password.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      await login({ email, password });
      showToast('Welcome back to the CircleUp Admin workspace!', 'success');
      navigate('/admin/overview', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid admin credentials.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f4e2] flex items-center justify-center p-4 selection:bg-[#1e2a1c] selection:text-[#f8f4e2]">
      <div className="max-w-md w-full bg-[#fcfbf7] border border-[#1e2a1c]/15 rounded-3xl p-8 sm:p-10 shadow-xl space-y-6">
        <div className="text-center space-y-1">
          <img src={circleUpLogo} alt="CircleUp" className="h-14 w-auto mx-auto mb-2 object-contain" />
          <h1 className="font-serif text-3xl font-bold text-[#1e2a1c] tracking-tight">CircleUp Admin</h1>
          <p className="text-xs uppercase tracking-widest text-[#8b5a3e] font-semibold">Store Management Portal</p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed"
          >
            <ShieldAlert className="size-4 shrink-0 text-red-600 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1e2a1c]/40" />
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@circleuponline.com"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#1e2a1c]/20 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e2a1c] transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-bold uppercase tracking-wider text-[#1e2a1c]/80 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1e2a1c]/40" />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-[#1e2a1c]/20 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e2a1c] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1e2a1c]/50 hover:text-[#1e2a1c] p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-sm font-semibold hover:bg-[#1e2a1c]/90 active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Quick Fill */}
        <div className="pt-2 border-t border-[#1e2a1c]/10 space-y-2">
          <p className="text-[0.68rem] uppercase font-bold tracking-wider text-[#8b5a3e] text-center">
            One-Click Demo Credentials
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail('owner@circleuponline.com');
                setPassword('OwnerPassword123');
              }}
              className="py-2 px-3 rounded-xl border border-[#1e2a1c]/20 bg-[#1e2a1c]/5 hover:bg-[#1e2a1c]/10 text-xs font-semibold text-[#1e2a1c] transition-colors text-center"
            >
              Fill Demo Owner
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('staff@circleuponline.com');
                setPassword('StaffPassword123');
              }}
              className="py-2 px-3 rounded-xl border border-[#1e2a1c]/20 bg-[#1e2a1c]/5 hover:bg-[#1e2a1c]/10 text-xs font-semibold text-[#1e2a1c] transition-colors text-center"
            >
              Fill Demo Staff
            </button>
          </div>
        </div>

        <div className="pt-2 text-center">
          <p className="text-[0.72rem] text-[#1e2a1c]/60">
            Protected area. Authorized team members only.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AdminLoginPage;
