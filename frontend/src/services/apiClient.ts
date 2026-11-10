import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiErrorDetail, ApiErrorResponse } from '@circleup/shared';
import { store } from '../app/store';
import { clearSession, setCredentials, type SessionUser } from '../store/slices/authSlice';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ApiErrorDetail[];
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: ApiErrorDetail[],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'CircleUpClient',
  },
});

export function normalizeApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<ApiErrorResponse>;
    const statusCode = axiosErr.response?.status ?? 0;
    const payload = axiosErr.response?.data?.error;

    if (payload) {
      return new ApiClientError(
        payload.message,
        statusCode,
        payload.code,
        payload.details,
        payload.requestId,
      );
    }

    if (axiosErr.code === 'ECONNABORTED') {
      return new ApiClientError('Request timed out. Please retry.', 408, 'REQUEST_TIMEOUT');
    }

    return new ApiClientError(
      axiosErr.message || 'Network connection error',
      statusCode,
      'NETWORK_ERROR',
    );
  }

  return new ApiClientError('Unexpected client error', 500, 'UNKNOWN_CLIENT_ERROR');
}

let activeRefreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(isAdminContext: boolean): Promise<string | null> {
  const endpoint = isAdminContext ? '/admin/auth/refresh' : '/auth/refresh';
  try {
    const response = await axios.post<{
      success: true;
      data: { accessToken: string; user?: SessionUser; admin?: SessionUser };
    }>(`${BASE_URL}${endpoint}`, {}, {
      withCredentials: true,
      headers: { 'X-Requested-With': 'CircleUpClient' },
    });

    const user = response.data.data.user ?? response.data.data.admin;
    const accessToken = response.data.data.accessToken;

    if (!accessToken || !user) {
      store.dispatch(clearSession());
      return null;
    }

    store.dispatch(setCredentials({ accessToken, user }));
    return accessToken;
  } catch {
    store.dispatch(clearSession());
    return null;
  }
}

apiClient.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state.auth.accessToken;
  const guestCartId = state.cartUi.guestCartId;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (guestCartId) {
    config.headers['X-Guest-Cart-Id'] = guestCartId;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const url = originalConfig?.url ?? '';

    const isRefreshEndpoint =
      url.includes('/auth/refresh') || url.includes('/admin/auth/refresh');

    if (status === 401 && originalConfig && !originalConfig._retry && !isRefreshEndpoint) {
      originalConfig._retry = true;
      const isAdminRoute =
        url.startsWith('/admin') ||
        (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'));

      if (!activeRefreshPromise) {
        activeRefreshPromise = refreshAccessToken(isAdminRoute).finally(() => {
          activeRefreshPromise = null;
        });
      }

      const freshToken = await activeRefreshPromise;
      if (freshToken) {
        originalConfig.headers.Authorization = `Bearer ${freshToken}`;
        return apiClient(originalConfig);
      }
    }

    return Promise.reject(normalizeApiError(error));
  },
);

