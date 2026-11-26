import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  const checkSession = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getMe();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    const data = await adminApi.login(credentials);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await adminApi.logout();
    } finally {
      setUser(null);
    }
  };

  const isOwner = user?.role === 'owner';

  const hasPermission = (permission: string): boolean => {
    return checkUserPermission(user, permission);
  };

  return (
    <AdminAuthContext.Provider
      value={{
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
      }}
    >
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
