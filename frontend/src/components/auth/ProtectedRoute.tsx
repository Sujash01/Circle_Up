import { useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { RootState } from '@/app/store';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  if (!isInitialized) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="mt-3 text-xs uppercase tracking-widest text-terracotta">Verifying Session...</p>
      </div>
    );
  }

  if (!user) {
    const redirectUrl = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?redirect=${encodeURIComponent(redirectUrl)}`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
