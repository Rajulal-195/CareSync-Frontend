import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginInput } from '@/api/services';
import { refreshAccessToken, toApiError } from '@/api/client';
import { disconnectSocket } from '@/api/socket';
import { useAuthStore } from '@/stores/authStore';

/** Try to restore a session from the HttpOnly refresh cookie. Safe to call once at startup. */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  try {
    await refreshAccessToken();
    // If /auth/refresh did not return the user, fetch it.
    if (!useAuthStore.getState().user) {
      store.setSession(await authApi.me(), useAuthStore.getState().accessToken!);
    }
  } catch {
    store.clear(); // no valid session; user will see the login page
  } finally {
    useAuthStore.getState().setInitialized();
  }
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: ({ user, accessToken, csrfToken }) => setSession(user, accessToken, csrfToken),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  return async () => {
    try {
      await authApi.logout(); // lets the backend clear the cookie
    } catch (e) {
      // Local state is cleared regardless so the user is never stuck signed in.
      console.warn('Logout request failed:', toApiError(e).message);
    } finally {
      disconnectSocket();
      clear();
      qc.clear(); // never leave one user's cached data for the next
    }
  };
}
