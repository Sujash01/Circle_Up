import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { ActorType, Role } from '@circleup/shared';
import { store } from '../src/app/store';
import { ApiClientError, normalizeApiError } from '../src/services/apiClient';
import { clearSession, setCredentials } from '../src/store/slices/authSlice';

describe('authSlice & apiClient error normalization', () => {
  it('stores session credentials in memory and clears cleanly on logout', () => {
    store.dispatch(
      setCredentials({
        accessToken: 'jwt-memory-token',
        user: {
          id: 'u-1',
          fullName: 'Aanya Sharma',
          email: 'aanya@example.com',
          actorType: ActorType.CUSTOMER,
          role: Role.CUSTOMER,
          permissions: [],
        },
      }),
    );

    expect(store.getState().auth.accessToken).toBe('jwt-memory-token');
    expect(store.getState().auth.user?.role).toBe(Role.CUSTOMER);

    store.dispatch(clearSession());
    expect(store.getState().auth.accessToken).toBeNull();
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.isInitialized).toBe(true);
  });

  it('normalizes backend ApiErrorResponse payloads into ApiClientError', () => {
    const axiosErr = new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Single-unit thrift item already sold',
          requestId: 'req-abc12345',
        },
      },
    });

    const normalized = normalizeApiError(axiosErr);
    expect(normalized).toBeInstanceOf(ApiClientError);
    expect(normalized.statusCode).toBe(409);
    expect(normalized.code).toBe('INSUFFICIENT_STOCK');
    expect(normalized.requestId).toBe('req-abc12345');
  });
});

