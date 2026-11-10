import type { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Role } from '@circleup/shared';
import type { RootState } from '../../../app/store';

function GuardShell({ children }: { children?: ReactNode }) {
  return children ? <>{children}</> : <Outlet />;
}

/**
 * Protects Customer CRM routes (/account/*).
 */
export function RequireCustomer({ children }: { children?: ReactNode }) {
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);
  const location = useLocation();

  if (!isInitialized) {
    return <div>Verifying session...</div>;
  }

  if (!user || user.role !== Role.CUSTOMER) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <GuardShell>{children}</GuardShell>;
}

/**
 * Protects Owner CRM routes (/admin/*). Rejects Customers cleanly.
 */
export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);
  const location = useLocation();

  if (!isInitialized) {
    return <div>Verifying admin session...</div>;
  }

  if (!user || (user.role !== Role.OWNER && user.role !== Role.STAFF)) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <GuardShell>{children}</GuardShell>;
}

/**
 * Redirects authenticated customers away from /login or /register.
 */
export function GuestOnly({ children }: { children?: ReactNode }) {
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  if (user && user.role === Role.CUSTOMER) {
    return <Navigate to="/account" replace />;
  }

  return <GuardShell>{children}</GuardShell>;
}

/**
 * Redirects authenticated admins away from /admin/login.
 */
export function AdminGuestOnly({ children }: { children?: ReactNode }) {
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  if (user && (user.role === Role.OWNER || user.role === Role.STAFF)) {
    return <Navigate to="/admin" replace />;
  }

  return <GuardShell>{children}</GuardShell>;
}

