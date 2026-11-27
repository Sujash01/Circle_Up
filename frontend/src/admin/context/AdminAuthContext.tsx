import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminApi } from '../services/adminApi';
import { hasPermission as checkUserPermission, type AdminUser } from '@circleup/shared';

interface AdminAuthContextValue {
  user: AdminUser | null;
  role: 'owner' | 'staff' | null;
  isOwner: boolean;
  isLoading: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Admin session check timeout')), 12000),
      );
      const data = await Promise.race([adminApi.getMe(), timeoutPromise]);
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    const data = await adminApi.login(credentials);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch {
      // Clear local session state even if network logout fails
    } finally {
      setUser(null);
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
      hasPermission,
      login,
      logout,
      checkSession,
    }),
    [user, isOwner, isLoading, hasPermission, login, logout, checkSession],
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
