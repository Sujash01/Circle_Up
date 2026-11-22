import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/app/store';
import { SignInPage } from '../src/features/public/SignInPage';
import { SignUpPage } from '../src/features/public/SignUpPage';

// Hoisted mocks for Supabase client
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockFrom = vi.fn();
const mockIsSupabaseConfigured = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Import authService AFTER mocking @/lib/supabase
import { authService } from '../src/services/authService';

describe('Auth Service Supabase Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockSignOut.mockResolvedValue({ error: null });
    await authService.signOut();
  });

  it('signs in with email and password, updating Redux store without saving plain password', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'mock-sb-access-token-12345',
          user: {
            id: 'mock-uuid-1',
            email: 'aanya@example.com',
            user_metadata: { full_name: 'Aanya Sharma' },
            email_confirmed_at: '2026-11-15T12:00:00Z',
          },
        },
        user: {
          id: 'mock-uuid-1',
          email: 'aanya@example.com',
          user_metadata: { full_name: 'Aanya Sharma' },
          email_confirmed_at: '2026-11-15T12:00:00Z',
        },
      },
      error: null,
    });

    const res = await authService.signIn({
      email: 'aanya@example.com',
      password: 'SecretPassword123!',
    });

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'aanya@example.com',
      password: 'SecretPassword123!',
    });
    expect(res.success).toBe(true);
    expect(res.user?.email).toBe('aanya@example.com');
    expect(res.user?.fullName).toBe('Aanya Sharma');
    expect(res.token).toBe('mock-sb-access-token-12345');

    // Confirm Redux state updated
    const state = store.getState().auth;
    expect(state.user?.email).toBe('aanya@example.com');
    expect(state.accessToken).toBe('mock-sb-access-token-12345');

    expect(localStorage.getItem('circleup_demo_session')).toBeNull();
    expect(sessionStorage.getItem('circleup_demo_session')).toBeNull();
  });

  it('signs up and initializes user session when email confirmation is not strictly required', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: {
          id: 'mock-uuid-2',
          email: 'rohan@example.com',
          user_metadata: { full_name: 'Rohan Mehta' },
        },
        session: {
          access_token: 'mock-signup-token-67890',
          user: {
            id: 'mock-uuid-2',
            email: 'rohan@example.com',
            user_metadata: { full_name: 'Rohan Mehta' },
          },
        },
      },
      error: null,
    });

    const res = await authService.signUp({
      fullName: 'Rohan Mehta',
      email: 'rohan@example.com',
      password: 'AnotherSecurePassword!',
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'rohan@example.com',
      password: 'AnotherSecurePassword!',
      options: {
        data: {
          full_name: 'Rohan Mehta',
        },
      },
    });
    expect(res.success).toBe(true);
    expect(res.user?.fullName).toBe('Rohan Mehta');
    expect(res.user?.email).toBe('rohan@example.com');
    expect(res.requiresEmailConfirmation).toBe(false);
    expect(res.token).toBe('mock-signup-token-67890');
  });

  it('does not fabricate a login when signup requires email confirmation', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: {
          id: 'mock-uuid-3',
          email: 'priya@example.com',
          user_metadata: { full_name: 'Priya Patel' },
        },
        session: null,
      },
      error: null,
    });
    const res = await authService.signUp({
      fullName: 'Priya Patel',
      email: 'priya@example.com',
      password: 'AnotherSecurePassword!',
    });

    expect(res.success).toBe(true);
    expect(res.requiresEmailConfirmation).toBe(true);
    expect(res.token).toBeUndefined();
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('correctly reports requiresEmailConfirmation: true when signup returns no session and email is unconfirmed', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: {
          id: 'mock-uuid-unconfirmed',
          email: 'unconfirmed@example.com',
          user_metadata: { full_name: 'Unconfirmed User' },
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    });
    const res = await authService.signUp({
      fullName: 'Unconfirmed User',
      email: 'unconfirmed@example.com',
      password: 'SecurePassword123!',
    });

    expect(res.success).toBe(true);
    expect(res.requiresEmailConfirmation).toBe(true);
    expect(res.token).toBeUndefined();
    expect(res.message).toContain('Please check your email to verify your account');
  });

  it('signs out and clears Redux state and sessions', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'mock-token',
          user: { id: 'u1', email: 'test@example.com' },
        },
        user: { id: 'u1', email: 'test@example.com' },
      },
      error: null,
    });

    await authService.signIn({ email: 'test@example.com', password: 'password123' });
    expect(store.getState().auth.user).not.toBeNull();

    await authService.signOut();
    expect(mockSignOut).toHaveBeenCalled();
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.accessToken).toBeNull();
  });

  it('requests password recovery email via Supabase', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const res = await authService.requestPasswordReset('recover@example.com');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('recover@example.com', {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    expect(res.success).toBe(true);
  });

  it('updates password via Supabase Auth updateUser', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });

    const res = await authService.updatePassword('BrandNewPass123!');
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'BrandNewPass123!' });
    expect(res.success).toBe(true);
  });

  it('initiates Google OAuth with provider "google" and callback redirect URL', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({ data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2' }, error: null });

    const res = await authService.signInWithGoogle({ redirectTarget: '/account/orders' });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=%2Faccount%2Forders`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    expect(res.success).toBe(true);
  });

  it('reports Google OAuth initiation errors without creating a session', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({ data: { provider: 'google', url: null }, error: { message: 'OAuth provider unavailable' } });
    const res = await authService.signInWithGoogle();
    expect(res.success).toBe(false);
    expect(res.message).toBe('OAuth provider unavailable');
    expect(store.getState().auth.user).toBeNull();
  });

  it('fails closed when Supabase is not configured and never creates a local demo session', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    localStorage.setItem('circleup_demo_session', JSON.stringify({ user: { id: 'fake' }, token: 'fake' }));
    sessionStorage.setItem('circleup_demo_session', JSON.stringify({ user: { id: 'fake' }, token: 'fake' }));

    expect((await authService.signIn({ email: 'a@b.com', password: 'password' })).success).toBe(false);
    expect((await authService.signUp({ fullName: 'A Person', email: 'a@b.com', password: 'password' })).success).toBe(false);
    expect((await authService.signInWithGoogle()).success).toBe(false);
    expect((await authService.sendPhoneOtp('+14155550123')).success).toBe(false);
    expect((await authService.verifyPhoneOtp('+14155550123', '1234')).success).toBe(false);
    expect((await authService.requestPasswordReset('a@b.com')).success).toBe(false);
    expect((await authService.updatePassword('new-password')).success).toBe(false);
    expect(authService.getStoredSession()).toBeNull();
    expect(store.getState().auth.user).toBeNull();
    localStorage.removeItem('circleup_demo_session');
    sessionStorage.removeItem('circleup_demo_session');
  });

  it('rejects invalid redirects and allows explicit customer routes', async () => {
    const { getSafeAuthRedirect } = await import('../src/services/authService');
    expect(getSafeAuthRedirect('//evil.example')).toBe('/account');
    expect(getSafeAuthRedirect('/\\evil.example')).toBe('/account');
    expect(getSafeAuthRedirect('/admin/overview')).toBe('/account');
    expect(getSafeAuthRedirect('/product/green-dress')).toBe('/product/green-dress');
    expect(getSafeAuthRedirect('/account/orders')).toBe('/account/orders');
  });

  it('reports OTP send and verification failures from Supabase without signing in', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: { message: 'SMS provider unavailable' } });
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: 'Invalid token' } });

    expect((await authService.sendPhoneOtp('+14155550123')).success).toBe(false);
    expect((await authService.verifyPhoneOtp('+14155550123', '1234')).success).toBe(false);
    expect(store.getState().auth.user).toBeNull();
  });

  it('reports Supabase password reset failures', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'Email provider unavailable' } });
    expect((await authService.requestPasswordReset('a@b.com')).success).toBe(false);
  });
});

describe('SignInPage & SignUpPage UI Rendering', () => {
  it('renders SignInPage with email, password, and controls', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <MemoryRouter>
          <SignInPage />
        </MemoryRouter>,
      );
    });

    const emailInput = host.querySelector('#signin-email') as HTMLInputElement | null;
    const passwordInput = host.querySelector('#signin-password') as HTMLInputElement | null;
    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const forgotLink = host.querySelector('a[href="/forgot-password"]');
    const signupLink = host.querySelector('a[href*="/signup"]');

    expect(emailInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(submitBtn).not.toBeNull();
    expect(forgotLink).not.toBeNull();
    expect(signupLink).not.toBeNull();
    expect(host.textContent).toContain('Sign In to CircleUp');
    expect(host.textContent).toContain('Member Access');
    expect(host.textContent).toContain('Continue with Google');
    expect(host.textContent).not.toContain('Demo');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders SignUpPage with registration fields and validation labels', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>,
      );
    });

    const nameInput = host.querySelector('#signup-name') as HTMLInputElement | null;
    const emailInput = host.querySelector('#signup-email') as HTMLInputElement | null;
    const passwordInput = host.querySelector('#signup-password') as HTMLInputElement | null;
    const confirmInput = host.querySelector('#signup-confirm-password') as HTMLInputElement | null;
    const signinLink = host.querySelector('a[href*="/signin"]');

    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(confirmInput).not.toBeNull();
    expect(signinLink).not.toBeNull();
    expect(host.textContent).toContain('Create Your Account');
    expect(host.textContent).toContain('Join CircleUp');
    expect(host.textContent).toContain('Continue with Google');
    expect(host.textContent).not.toContain('Demo');

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
