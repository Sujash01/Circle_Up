import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminApi } from '../services/adminApi';
import { hasPermission as checkUserPermission, type AdminUser } from '@circleup/shared';

export const SESSION_WARNING_WINDOW_MS = 5 * 60 * 1000;

interface SessionTiming {
  expiresAt: number;
  idleTimeoutMs: number;
  idleExpiresAt: number;
}

interface AdminAuthContextValue {
  user: AdminUser | null;
  role: 'owner' | 'staff' | null;
  isOwner: boolean;
  isLoading: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  sessionWarningRemainingMs: number | null;
  hasPermission: (permission: string) => boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  renewSession: () => Promise<boolean>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionTiming, setSessionTiming] = useState<SessionTiming | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionWarningRemainingMs, setSessionWarningRemainingMs] = useState<number | null>(null);

  const applySessionPayload = useCallback(
    (data: { user: AdminUser; session?: SessionTiming }) => {
      setUser(data.user);
      setSessionExpired(false);
      if (data.session) {
        setSessionTiming(data.session);
      } else {
        setSessionTiming(null);
      }
      setSessionWarningRemainingMs(null);
    },
    [],
  );

  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Admin session check timeout')), 12000),
      );
      const data = await Promise.race([adminApi.getMe(), timeoutPromise]);
      applySessionPayload(data);
    } catch {
      setUser(null);
      setSessionTiming(null);
      setSessionWarningRemainingMs(null);
    } finally {
      setIsLoading(false);
    }
  }, [applySessionPayload]);

  const renewSession = useCallback(async (): Promise<boolean> => {
    try {
      const data = await adminApi.getMe();
      applySessionPayload(data);
      return true;
    } catch {
      setSessionExpired(true);
      setSessionWarningRemainingMs(null);
      return false;
    }
  }, [applySessionPayload]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    const handleExpired = () => {
      setSessionWarningRemainingMs(null);
      setSessionExpired(true);
    };
    const handleActivity = () => {
      setSessionTiming((prev) => {
        if (!prev) return prev;
        const nextIdleExpiresAt = Math.min(prev.expiresAt, Date.now() + prev.idleTimeoutMs);
        return { ...prev, idleExpiresAt: nextIdleExpiresAt };
      });
      setSessionWarningRemainingMs(null);
    };
    window.addEventListener('circleup:admin-session-expired', handleExpired);
    window.addEventListener('circleup:admin-session-activity', handleActivity);
    return () => {
      window.removeEventListener('circleup:admin-session-expired', handleExpired);
      window.removeEventListener('circleup:admin-session-activity', handleActivity);
    };
  }, []);

  useEffect(() => {
    if (!user || !sessionTiming || sessionExpired) {
      setSessionWarningRemainingMs(null);
      return;
    }

    const evaluateExpiry = () => {
      const effectiveExpiry = Math.min(sessionTiming.expiresAt, sessionTiming.idleExpiresAt);
      const remaining = effectiveExpiry - Date.now();
      if (remaining <= 0) {
        setSessionWarningRemainingMs(null);
        setSessionExpired(true);
      } else if (remaining <= SESSION_WARNING_WINDOW_MS) {
        setSessionWarningRemainingMs(remaining);
      } else {
        setSessionWarningRemainingMs(null);
      }
    };

    evaluateExpiry();
    const timer = window.setInterval(evaluateExpiry, 30_000);
    return () => window.clearInterval(timer);
  }, [user, sessionTiming, sessionExpired]);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      const data = await adminApi.login(credentials);
      applySessionPayload(data);
    },
    [applySessionPayload],
  );

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch {
      // Clear local session state even if network logout fails
    } finally {
      setUser(null);
      setSessionTiming(null);
      setSessionExpired(false);
      setSessionWarningRemainingMs(null);
    }
  }, []);

  const isOwner = user?.role === 'owner';

  const hasPermission = useCallback(
    (permission: string): boolean => checkUserPermission(user, permission),
    [user],
  );

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      user,
      role: user?.role || null,
      isOwner,
      isLoading,
      loading: isLoading,
      isAuthenticated: Boolean(user),
      sessionExpired,
      sessionWarningRemainingMs,
      hasPermission,
      login,
      logout,
      checkSession,
      renewSession,
    }),
    [
      user,
      isOwner,
      isLoading,
      sessionExpired,
      sessionWarningRemainingMs,
      hasPermission,
      login,
      logout,
      checkSession,
      renewSession,
    ],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}
