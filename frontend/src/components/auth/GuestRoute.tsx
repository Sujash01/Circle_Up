import { useSelector } from 'react-redux';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import type { RootState } from '@/app/store';
import { Loader2 } from 'lucide-react';

interface GuestRouteProps {
  children?: React.ReactNode;
}

export function GuestRoute({ children }: GuestRouteProps) {
  const [searchParams] = useSearchParams();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);
  const redirectTarget = searchParams.get('redirect') || '/account';

  if (!isInitialized) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="mt-3 text-xs uppercase tracking-widest text-terracotta">Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTarget} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
