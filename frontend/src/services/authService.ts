import { store } from '@/app/store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  clearSession,
  markAuthInitialized,
  setCredentials,
  type SessionUser,
} from '@/store/slices/authSlice';
import type { ActorType, Role } from '@circleup/shared';
import type { Session, User } from '@supabase/supabase-js';

export interface SignInCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpData {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: SessionUser;
  token?: string;
  requiresEmailConfirmation?: boolean;
  message?: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Maps a Supabase Auth User object and optional Profile into the internal SessionUser contract.
 */
export function mapSupabaseUserToSessionUser(
  user: User,
  profile?: { full_name?: string | null; avatar_url?: string | null } | null,
): SessionUser {
  const metadataName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    '';
  const emailName = user.email ? user.email.split('@')[0] : '';
  const fullName = profile?.full_name || metadataName || emailName || 'CircleUp Member';

  const rawProvider =
    (user.app_metadata?.provider as string) ||
    (user.user_metadata?.provider as string) ||
    'email';
  const authProvider = rawProvider === 'google' ? 'google' : rawProvider === 'phone' ? 'phone' : 'email';

  const avatarUrl =
    profile?.avatar_url ||
    (user.user_metadata?.avatar_url as string) ||
    (user.user_metadata?.picture as string) ||
    undefined;

  return {
    id: user.id,
    fullName,
    email: user.email || '',
    phone: user.phone || undefined,
    avatarUrl,
    authProvider,
    actorType: 'CUSTOMER' as ActorType,
    role: 'CUSTOMER' as Role,
    permissions: [],
    isEmailVerified: Boolean(user.email_confirmed_at),
  };
}

const AUTH_REDIRECT_PATHS = new Set([
  '/', '/account', '/account/orders', '/account/profile', '/cart', '/wishlist', '/checkout', '/search', '/rentals',
  '/events', '/about', '/contact', '/brand-new', '/thrifted', '/new-arrivals',
  '/womens-upperwear', '/womens-bottomwear', '/womens-one-piece', '/mens-upperwear',
  '/mens-bottomwear', '/footwear', '/ethnic-wear', '/thrifted-treasure', '/jewellery',
  '/accessories', '/handcrafted', '/thriftcrew',
]);

/** Accept only known customer-facing internal destinations for post-auth redirects. */
export function getSafeAuthRedirect(value?: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/account';
  try {
    const parsed = new URL(value, 'https://circleup.invalid');
    if (parsed.origin !== 'https://circleup.invalid' || parsed.hash) return '/account';
    const isProductRoute = /^\/product\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(parsed.pathname);
    const isEventRoute = /^\/events\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(parsed.pathname);
    return AUTH_REDIRECT_PATHS.has(parsed.pathname) || isProductRoute || isEventRoute
      ? parsed.pathname
      : '/account';
  } catch {
    return '/account';
  }
}

class AuthService {
  private authListenerSubscription: { unsubscribe: () => void } | null = null;
  private isListening = false;

  /** Returns only a currently authenticated Supabase session mirrored in Redux. */
  public getStoredSession(): { user: SessionUser; token: string } | null {
    const state = store.getState().auth;
    if (state.user && state.accessToken) {
      return { user: state.user, token: state.accessToken };
    }
    return null;
  }

  /**
   * Initializes persistent Supabase auth listener and synchronizes session with Redux store.
   * Cleans up automatically via returned unsubscribe handler.
   */
  public initAuthListener(): () => void {
    if (this.isListening) {
      return () => this.cleanupAuthListener();
    }
    this.isListening = true;

    if (!isSupabaseConfigured()) {
      store.dispatch(clearSession());
      store.dispatch(markAuthInitialized());
      return () => {};
    }

    // 1. Initial active session check
    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (!error && session?.user) {
          await this.syncSessionWithRedux(session);
        } else {
          store.dispatch(clearSession());
        }
      })
      .catch(() => {
        store.dispatch(clearSession());
      })
      .finally(() => {
        store.dispatch(markAuthInitialized());
      });

    // 2. Continuous auth state change subscription
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        await this.syncSessionWithRedux(session);
      } else if (event === 'SIGNED_OUT') {
        store.dispatch(clearSession());
      }
    });

    this.authListenerSubscription = data.subscription;

    return () => this.cleanupAuthListener();
  }

  public cleanupAuthListener(): void {
    if (this.authListenerSubscription) {
      this.authListenerSubscription.unsubscribe();
      this.authListenerSubscription = null;
    }
    this.isListening = false;
  }

  /**
   * Fetches the user profile from `profiles` table and updates Redux credentials.
   */
  private async syncSessionWithRedux(session: Session): Promise<void> {
    let profileData: { full_name?: string | null; avatar_url?: string | null } | null = null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!error && data) {
        profileData = data;
      }
    } catch {
      // Non-blocking if profiles table not created yet or trigger already handled it
    }

    const sessionUser = mapSupabaseUserToSessionUser(session.user, profileData);
    store.dispatch(
      setCredentials({
        accessToken: session.access_token,
        user: sessionUser,
      }),
    );
  }

  /**
   * Register with Email and Password using Supabase Auth.
   */
  public async signUp(data: SignUpData): Promise<AuthResponse> {
    const trimmedEmail = data.email.trim().toLowerCase();
    const fullName = data.fullName.trim();

    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: data.password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      if (!authData.user) {
        return {
          success: false,
          message: 'Unable to complete registration. Please try again.',
        };
      }

      const activeSession = authData.session;
      if (activeSession) await this.syncSessionWithRedux(activeSession);
      const sessionUser = mapSupabaseUserToSessionUser(authData.user);
      const requiresEmailConfirmation = !activeSession;

      return {
        success: true,
        user: sessionUser,
        token: activeSession?.access_token,
        requiresEmailConfirmation,
        message: requiresEmailConfirmation
          ? 'Account created! Please check your email to verify your account before signing in.'
          : 'Account created successfully! Welcome to CircleUp.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during registration.';
      return { success: false, message: msg };
    }
  }

  /**
   * Sign in with email and password using Supabase Auth.
   */
  public async signIn(credentials: SignInCredentials): Promise<AuthResponse> {
    const trimmedEmail = credentials.email.trim().toLowerCase();

    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: credentials.password,
      });

      if (error) {
        let friendlyMessage = error.message;
        if (error.message.includes('Invalid login credentials')) {
          friendlyMessage = 'Invalid email or password. Please verify your credentials.';
        } else if (error.message.includes('Email not confirmed')) {
          friendlyMessage = 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
        }
        return {
          success: false,
          message: friendlyMessage,
        };
      }

      if (!data.session || !data.user) {
        return {
          success: false,
          message: 'Failed to establish session. Please try again.',
        };
      }

      await this.syncSessionWithRedux(data.session);
      const sessionUser = store.getState().auth.user || mapSupabaseUserToSessionUser(data.user);

      return {
        success: true,
        user: sessionUser,
        token: data.session.access_token,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during sign in.';
      return { success: false, message: msg };
    }
  }

  /**
   * Sign Out and terminate Supabase session.
   */
  public async signOut(): Promise<void> {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } finally {
      store.dispatch(clearSession());
    }
  }

  /**
   * Initiates password recovery email using Supabase Auth.
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const trimmedEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'If an account exists with this email, password reset instructions have been sent.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send password reset request.';
      return { success: false, message: msg };
    }
  }

  /**
   * Updates password for the authenticated recovery user.
   */
  public async updatePassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Your password has been successfully updated.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      return { success: false, message: msg };
    }
  }

  /**
   * Resends verification email for unconfirmed accounts.
   */
  public async resendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    const trimmedEmail = email.trim().toLowerCase();
    if (!isSupabaseConfigured()) {
      return { success: false, message: 'Supabase is not configured.' };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Verification email has been re-sent. Please check your inbox.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend verification email.';
      return { success: false, message: msg };
    }
  }

  /**
   * Reads profile data from Supabase `profiles` table.
   */
  public async getProfile(userId: string): Promise<UserProfile | null> {
    if (!isSupabaseConfigured()) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        fullName: data.full_name || '',
        email: data.email || '',
        avatarUrl: data.avatar_url || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Updates profile record in Supabase `profiles` table.
   */
  public async updateProfile(
    userId: string,
    updates: { fullName?: string; avatarUrl?: string },
  ): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: false, message: 'Supabase is not configured.' };
    }

    try {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.fullName !== undefined) payload.full_name = updates.fullName.trim();
      if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('id')
        .maybeSingle();

      if (error) {
        return { success: false, message: error.message };
      }
      if (!data) return { success: false, message: 'Profile was not found; no changes were saved.' };

      // Update active user in Redux store
      const state = store.getState();
      if (state.auth.user && state.auth.user.id === userId) {
        store.dispatch(
          setCredentials({
            accessToken: state.auth.accessToken || '',
            user: {
              ...state.auth.user,
              fullName: updates.fullName !== undefined ? updates.fullName.trim() : state.auth.user.fullName,
              avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : state.auth.user.avatarUrl,
            },
          }),
        );
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      return { success: false, message: msg };
    }
  }

  /** Initiate Google OAuth through Supabase Auth. */
  public async signInWithGoogle(options?: { redirectTarget?: string }): Promise<AuthResponse> {
    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };
    try {
      const target = getSafeAuthRedirect(options?.redirectTarget);
      const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(target)}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { access_type: 'offline', prompt: 'consent' } },
      });
      if (error) return { success: false, message: error.message || 'Google sign-in could not be initiated.' };
      if (!data?.url) return { success: false, message: 'Supabase did not provide a Google sign-in URL.' };
      // Supabase's browser client performs the redirect unless skipBrowserRedirect is set.
      return { success: true };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Google sign-in could not be initiated.' };
    }
  }

  /**
   * Phone Number OTP Request
   */
  public async sendPhoneOtp(phone: string, fullName?: string): Promise<{ success: boolean; message: string }> {
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
        options: fullName?.trim() ? { data: { full_name: fullName.trim() } } : undefined,
      });
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Verification code sent to ${formattedPhone}.` };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed to send verification code.' };
    }
  }

  /**
   * Phone Number OTP Verification & Sign In
   */
  public async verifyPhoneOtp(phone: string, otp: string): Promise<AuthResponse> {
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
    if (!isSupabaseConfigured()) return { success: false, message: 'Supabase is not configured.' };
    if (!otp.trim()) return { success: false, message: 'Enter the verification code.' };
    try {
      const { data, error } = await supabase.auth.verifyOtp({ phone: formattedPhone, token: otp.trim(), type: 'sms' });
      if (error) return { success: false, message: error.message };
      if (!data.session || !data.user) return { success: false, message: 'Supabase did not establish an authenticated session.' };
      await this.syncSessionWithRedux(data.session);
      return { success: true, user: store.getState().auth.user || mapSupabaseUserToSessionUser(data.user), token: data.session.access_token };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Phone verification failed.' };
    }
  }
}

export const authService = new AuthService();
