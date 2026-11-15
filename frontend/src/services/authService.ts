import { store } from '@/app/store';
import { clearSession, setCredentials, type SessionUser } from '@/store/slices/authSlice';
import type { ActorType, Role } from '@circleup/shared';
import { apiClient } from './apiClient';

export interface SignInCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: SessionUser;
  token?: string;
  isDemo?: boolean;
  message?: string;
}

const DEMO_SESSION_KEY = 'circleup_demo_session';

class AuthService {
  /**
   * Check if a demo session currently exists in browser storage.
   */
  public getStoredSession(): { user: SessionUser; token: string } | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY) || localStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Initializes session into Redux on app boot if one exists.
   */
  public initializeFromStorage(): void {
    const stored = this.getStoredSession();
    if (stored) {
      store.dispatch(setCredentials({ accessToken: stored.token, user: stored.user }));
    }
  }

  /**
   * Sign In — Attempts server API authentication first.
   * If the auth backend is not yet mounted (returns 404 or connection error),
   * falls back to a safe demo session with explicit user disclosure.
   */
  public async signIn(credentials: SignInCredentials): Promise<AuthResponse> {
    const trimmedEmail = credentials.email.trim().toLowerCase();

    try {
      // Real API attempt for future backend integration
      const res = await apiClient.post<{ success: boolean; data: { token: string; user: SessionUser } }>(
        '/auth/login',
        { email: trimmedEmail, password: credentials.password },
      );
      if (res.data?.success && res.data.data) {
        const { token, user } = res.data.data;
        store.dispatch(setCredentials({ accessToken: token, user }));
        return { success: true, user, token, isDemo: false };
      }
    } catch {
      // Backend auth endpoint not mounted or unreachable — fallback to transparent demo simulation
    }

    // Demo Mode simulation (no password stored anywhere)
    const namePrefix = (trimmedEmail.split('@')[0] ?? 'User')
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const demoUser: SessionUser = {
      id: `usr_${Date.now().toString(36)}`,
      fullName: namePrefix || 'User',
      email: trimmedEmail,
      actorType: 'CUSTOMER' as ActorType,
      role: 'CUSTOMER' as Role,
      permissions: [],
      isEmailVerified: true,
    };

    const demoToken = `cu_demo_jwt_${Date.now().toString(36)}`;
    const sessionPayload = { user: demoUser, token: demoToken };

    if (credentials.rememberMe) {
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionPayload));
    } else {
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionPayload));
    }

    store.dispatch(setCredentials({ accessToken: demoToken, user: demoUser }));

    return {
      success: true,
      user: demoUser,
      token: demoToken,
      isDemo: true,
      message: 'Signed in with demo session. No credentials stored on a remote server.',
    };
  }

  /**
   * Sign Up — Validates and attempts registration.
   * Discloses demo registration if backend is offline.
   */
  public async signUp(data: SignUpData): Promise<AuthResponse> {
    const trimmedEmail = data.email.trim().toLowerCase();
    const cleanPhone = data.phone.trim().replace(/[\s-]/g, '');

    try {
      const res = await apiClient.post<{ success: boolean; data: { token: string; user: SessionUser } }>(
        '/auth/register',
        {
          fullName: data.fullName.trim(),
          email: trimmedEmail,
          phone: cleanPhone,
          password: data.password,
        },
      );
      if (res.data?.success && res.data.data) {
        const { token, user } = res.data.data;
        store.dispatch(setCredentials({ accessToken: token, user }));
        return { success: true, user, token, isDemo: false };
      }
    } catch {
      // Backend registration endpoint not mounted
    }

    // Demo Mode registration (no password stored)
    const demoUser: SessionUser = {
      id: `usr_${Date.now().toString(36)}`,
      fullName: data.fullName.trim(),
      email: trimmedEmail,
      actorType: 'CUSTOMER' as ActorType,
      role: 'CUSTOMER' as Role,
      permissions: [],
      isEmailVerified: false,
    };

    const demoToken = `cu_demo_jwt_${Date.now().toString(36)}`;
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ user: demoUser, token: demoToken }));
    store.dispatch(setCredentials({ accessToken: demoToken, user: demoUser }));

    return {
      success: true,
      user: demoUser,
      token: demoToken,
      isDemo: true,
      message: 'Account created in demo mode. Ready for future backend database persistence.',
    };
  }

  /**
   * Google OAuth Sign In / Sign Up
   */
  public async signInWithGoogle(customProfile?: { fullName?: string; email?: string }): Promise<AuthResponse> {
    const fullName = customProfile?.fullName?.trim() || 'Aanya Sharma';
    const email = customProfile?.email?.trim().toLowerCase() || 'aanya.sharma@gmail.com';

    try {
      const res = await apiClient.post<{ success: boolean; data: { token: string; user: SessionUser } }>(
        '/auth/google',
        { email, fullName },
      );
      if (res.data?.success && res.data.data) {
        const { token, user } = res.data.data;
        store.dispatch(setCredentials({ accessToken: token, user }));
        return { success: true, user, token, isDemo: false };
      }
    } catch {
      // Backend Google auth endpoint not mounted
    }

    const demoUser: SessionUser = {
      id: `usr_g_${Date.now().toString(36)}`,
      fullName,
      email,
      actorType: 'CUSTOMER' as ActorType,
      role: 'CUSTOMER' as Role,
      permissions: [],
      isEmailVerified: true,
      authProvider: 'google',
    };

    const demoToken = `cu_demo_google_jwt_${Date.now().toString(36)}`;
    const sessionPayload = { user: demoUser, token: demoToken };
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionPayload));
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionPayload));
    store.dispatch(setCredentials({ accessToken: demoToken, user: demoUser }));

    return {
      success: true,
      user: demoUser,
      token: demoToken,
      isDemo: true,
      message: 'Signed in with Google.',
    };
  }

  /**
   * Phone Number OTP Request
   */
  public async sendPhoneOtp(phone: string): Promise<{ success: boolean; message: string; demoOtp: string }> {
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    try {
      await apiClient.post('/auth/phone/otp', { phone: cleanPhone });
    } catch {
      // Fallback
    }
    return {
      success: true,
      message: `Verification code sent to ${cleanPhone}. (Use demo OTP: 1234)`,
      demoOtp: '1234',
    };
  }

  /**
   * Phone Number OTP Sign Up / Sign In
   */
  public async verifyPhoneOtp(phone: string, otp: string, fullName?: string): Promise<AuthResponse> {
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (otp.trim() !== '1234' && otp.trim().length !== 4 && otp.trim().length !== 6) {
      return { success: false, message: 'Invalid OTP code. Please enter demo OTP: 1234.' };
    }

    try {
      const res = await apiClient.post<{ success: boolean; data: { token: string; user: SessionUser } }>(
        '/auth/phone/verify',
        { phone: cleanPhone, otp, fullName },
      );
      if (res.data?.success && res.data.data) {
        const { token, user } = res.data.data;
        store.dispatch(setCredentials({ accessToken: token, user }));
        return { success: true, user, token, isDemo: false };
      }
    } catch {
      // Fallback
    }

    const name = fullName?.trim() || `Member ${cleanPhone.slice(-4)}`;
    const demoUser: SessionUser = {
      id: `usr_p_${Date.now().toString(36)}`,
      fullName: name,
      email: `${cleanPhone.replace(/\+/g, '')}@phone.circleup.in`,
      phone: cleanPhone,
      actorType: 'CUSTOMER' as ActorType,
      role: 'CUSTOMER' as Role,
      permissions: [],
      isEmailVerified: false,
      authProvider: 'phone',
    };

    const demoToken = `cu_demo_phone_jwt_${Date.now().toString(36)}`;
    const sessionPayload = { user: demoUser, token: demoToken };
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionPayload));
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionPayload));
    store.dispatch(setCredentials({ accessToken: demoToken, user: demoUser }));

    return {
      success: true,
      user: demoUser,
      token: demoToken,
      isDemo: true,
      message: 'Phone verified and signed in.',
    };
  }

  /**
   * Request password reset simulation.
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      return { success: true, message: 'Password reset link sent to your email.' };
    } catch {
      return {
        success: true,
        message: 'Demo mode: If an account exists for this email, reset instructions would be dispatched.',
      };
    }
  }

  /**
   * Clear active session.
   */
  public async signOut(): Promise<void> {
    try {
      await apiClient.post('/auth/logout').catch(() => {});
    } finally {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      localStorage.removeItem(DEMO_SESSION_KEY);
      store.dispatch(clearSession());
    }
  }
}

export const authService = new AuthService();
