import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { authService } from '../src/services/authService';
import { store } from '../src/app/store';
import { SignInPage } from '../src/features/public/SignInPage';
import { SignUpPage } from '../src/features/public/SignUpPage';

describe('Auth Service & Modular Architecture', () => {
  beforeEach(async () => {
    await authService.signOut();
  });

  it('signs in in demo mode when backend is offline and stores safe session without password', async () => {
    const res = await authService.signIn({
      email: 'aanya@example.com',
      password: 'SecretPassword123!',
      rememberMe: true,
    });

    expect(res.success).toBe(true);
    expect(res.isDemo).toBe(true);
    expect(res.user?.email).toBe('aanya@example.com');
    expect(res.token).toContain('cu_demo_jwt_');

    // Confirm Redux state updated
    const state = store.getState().auth;
    expect(state.user?.email).toBe('aanya@example.com');
    expect(state.accessToken).toBe(res.token);

    // Confirm NO password is saved in localStorage or sessionStorage
    const local = localStorage.getItem('circleup_demo_session') || '';
    const session = sessionStorage.getItem('circleup_demo_session') || '';
    expect(local).not.toContain('SecretPassword123!');
    expect(session).not.toContain('SecretPassword123!');
  });

  it('signs up and initializes user session cleanly', async () => {
    const res = await authService.signUp({
      fullName: 'Rohan Mehta',
      email: 'rohan@example.com',
      phone: '+919820011223',
      password: 'AnotherSecurePassword!',
    });

    expect(res.success).toBe(true);
    expect(res.user?.fullName).toBe('Rohan Mehta');
    expect(res.user?.email).toBe('rohan@example.com');
  });

  it('signs out and clears Redux state and storage', async () => {
    await authService.signIn({ email: 'test@example.com', password: 'password123' });
    expect(store.getState().auth.user).not.toBeNull();

    await authService.signOut();
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.accessToken).toBeNull();
    expect(localStorage.getItem('circleup_demo_session')).toBeNull();
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

    expect(emailInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(submitBtn).not.toBeNull();
    expect(host.textContent).toContain('Sign In to CircleUp');
    expect(host.textContent).toContain('Frontend Simulation');

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
    const phoneInput = host.querySelector('#signup-phone') as HTMLInputElement | null;
    const passwordInput = host.querySelector('#signup-password') as HTMLInputElement | null;
    const confirmInput = host.querySelector('#signup-confirm-password') as HTMLInputElement | null;

    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();
    expect(phoneInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(confirmInput).not.toBeNull();
    expect(host.textContent).toContain('Create Your CircleUp Account');

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
