import { create } from 'zustand';
import type { AuthUser } from '@/types';

/**
 * Auth state lives in memory only. The access token is never written to
 * localStorage; the refresh token is an HttpOnly cookie managed by the backend.
 */
interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  /** Double-submit CSRF token for /auth/refresh and /auth/logout (memory only, like the access token). */
  csrfToken: string | null;
  /** true once the initial silent-refresh attempt has finished */
  initialized: boolean;
  setSession: (user: AuthUser, accessToken: string, csrfToken?: string | null) => void;
  setAccessToken: (token: string) => void;
  setCsrfToken: (token: string | null) => void;
  setInitialized: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  csrfToken: null,
  initialized: false,
  setSession: (user, accessToken, csrfToken) => set((s) => ({ user, accessToken, csrfToken: csrfToken ?? s.csrfToken })),
  setAccessToken: (accessToken) => set({ accessToken }),
  setCsrfToken: (csrfToken) => set({ csrfToken }),
  setInitialized: () => set({ initialized: true }),
  clear: () => set({ user: null, accessToken: null, csrfToken: null }),
}));
