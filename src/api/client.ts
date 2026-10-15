import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { friendlyMessage } from './errors';
import { mapAuthUser, UI_FIELD_ALIASES, type Raw } from './adapters';
import type { ApiEnvelope, ApiErrorShape } from '@/types';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';

/** Main client: attaches the in-memory access token; cookies sent for refresh. */
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
});

/** Bare client for the refresh call so it never runs through the retry interceptor. Exported for tests. */
export const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20_000,
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

let csrfPromise: Promise<string> | null = null;

/**
 * The backend protects the cookie-based endpoints (/auth/refresh, /auth/logout) with a double-submit CSRF
 * token: the `X-CSRF-Token` header must equal the `csrf_token` cookie. The cookie is scoped to
 * /api/v1/auth and so is not readable from the page; the token comes from the login/refresh response or,
 * after a page reload, from GET /auth/csrf (which re-uses the existing cookie value).
 */
export function ensureCsrfToken(force = false): Promise<string> {
  const existing = useAuthStore.getState().csrfToken;
  if (existing && !force) return Promise.resolve(existing);
  if (!csrfPromise) {
    csrfPromise = refreshClient
      .get<ApiEnvelope<{ csrfToken: string }>>('/auth/csrf')
      .then((res) => {
        const token = res.data.data.csrfToken;
        useAuthStore.getState().setCsrfToken(token);
        return token;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

const postRefresh = (csrf: string) =>
  refreshClient.post<ApiEnvelope<Raw>>('/auth/refresh', undefined, { headers: { 'X-CSRF-Token': csrf } });

let refreshPromise: Promise<string> | null = null;

/** Single-flight refresh: concurrent 401s share one request. */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      let res;
      try {
        res = await postRefresh(await ensureCsrfToken());
      } catch (e) {
        // A stale token (cookie rotated or expired) is answered with 403: fetch a fresh one and retry once.
        if (axios.isAxiosError(e) && e.response?.status === 403) res = await postRefresh(await ensureCsrfToken(true));
        else throw e;
      }
      const { accessToken, user, csrfToken } = res.data.data;
      const store = useAuthStore.getState();
      if (csrfToken) store.setCsrfToken(csrfToken);
      if (user) store.setSession(mapAuthUser(user), accessToken);
      else store.setAccessToken(accessToken);
      return accessToken as string;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

let onSessionExpired: (() => void) | null = null;
export function registerSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const isAuthCall = AUTH_PATHS.some((p) => original?.url?.includes(p));

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true; // guarantees at most one retry -> no infinite loop
      try {
        const token = await refreshAccessToken();
        original.headers.set('Authorization', `Bearer ${token}`);
        return api(original as AxiosRequestConfig);
      } catch {
        useAuthStore.getState().clear();
        onSessionExpired?.();
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Normalize any thrown value into a displayable error. The backend's error body is
 * `{ success: false, message, error: { code, details? }, requestId }`: validation failures carry
 * `details: [{ path, message }]`; other errors (e.g. SCHEDULE_CONFLICT) carry an arbitrary `details` object.
 */
export function toApiError(err: unknown): ApiErrorShape {
  if (axios.isCancel(err)) return { message: 'Request cancelled' };
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as
      | { message?: string; error?: { code?: string; details?: unknown } }
      | undefined;
    const details = body?.error?.details;
    const fieldErrors: Record<string, string> = {};
    let data: unknown;
    if (Array.isArray(details)) {
      for (const d of details as Array<{ path?: string; message?: string }>) {
        if (!d?.path || !d.message) continue;
        const key = UI_FIELD_ALIASES[d.path] ?? d.path;
        if (!(key in fieldErrors)) fieldErrors[key] = d.message; // keep the first message per field
      }
    } else {
      data = details;
    }
    if (!err.response) return { message: friendlyMessage(undefined) };
    return {
      status: err.response.status,
      code: body?.error?.code,
      message: friendlyMessage(err.response.status, body?.message),
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
      data,
    };
  }
  return { message: err instanceof Error ? err.message : 'Something went wrong' };
}

/** Unwrap the `{ success, message, data, meta }` envelope. */
export async function unwrap<T>(p: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  const res = await p;
  return res.data.data;
}
