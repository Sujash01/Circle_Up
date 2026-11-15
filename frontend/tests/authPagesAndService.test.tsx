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
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Import authService AFTER mocking @/lib/supabase
import { authService } from '../src/services/authService';

describe('Auth Service Supabase Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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

    // Confirm password is never leaked into localStorage or sessionStorage
    const local = localStorage.getItem('circleup_demo_session') || '';
    const session = sessionStorage.getItem('circleup_demo_session') || '';
    expect(local).not.toContain('SecretPassword123!');
    expect(session).not.toContain('SecretPassword123!');
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

  it('signs up and immediately establishes JWT token via signInWithPassword fallback if session was not returned in initial signUp', async () => {
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
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: 'mock-uuid-3', email: 'priya@example.com' },
        session: { access_token: 'mock-auto-login-jwt-token' },
      },
      error: null,
    });

    const res = await authService.signUp({
      fullName: 'Priya Patel',
      email: 'priya@example.com',
      password: 'AnotherSecurePassword!',
    });

    expect(res.success).toBe(true);
    expect(res.requiresEmailConfirmation).toBe(false);
    expect(res.token).toBe('mock-auto-login-jwt-token');
    expect(store.getState().auth.accessToken).toBe('mock-auto-login-jwt-token');
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
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Email not confirmed' },
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

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
