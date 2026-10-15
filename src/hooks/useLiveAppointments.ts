import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '@/api/socket';
import { refreshAccessToken } from '@/api/client';
import { ALL_APPOINTMENT_KEYS, ALL_EVENTS, AUTH_EXPIRED_EVENT, SYNC_EVENT, keysToInvalidate, notificationFor } from '@/api/events';
import { toast, useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';

/** A live notice is skipped if the user's own action just produced a success toast. */
const ECHO_WINDOW_MS = 3000;

/**
 * Subscribes to appointment and slot events and invalidates the matching TanStack Query caches.
 *
 * - Only runs with a signed-in session; the socket is authenticated by the session (see api/socket.ts).
 * - Socket payloads are never trusted or displayed: they only decide *which* caches to refetch, and the
 *   data comes back from the authorised REST API. Notices use fixed generic wording.
 * - One listener per event; all are removed (and the socket closed) on unmount, so React StrictMode's
 *   double-mount never leaves duplicates. Identical toasts are deduplicated by the toast store.
 * - The server sends `sync:required` on every (re)connect (events are not replayed), so everything is
 *   refetched then. `auth:expired` means the access token that opened the socket ran out and the server
 *   closed it: refresh the token and reconnect.
 */
export function useLiveAppointments() {
  const qc = useQueryClient();
  const authed = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    if (!authed) return;
    const socket = connectSocket();
    if (!socket) return;

    const handlers = ALL_EVENTS.map((event) => {
      const handler = (payload?: unknown) => {
        keysToInvalidate(event, payload).forEach((queryKey) => qc.invalidateQueries({ queryKey }));
        const notice = notificationFor(event);
        if (notice && Date.now() - useToastStore.getState().lastSuccessAt > ECHO_WINDOW_MS) toast.info(notice);
      };
      socket.on(event, handler);
      return [event, handler] as const;
    });

    const onSync = () => ALL_APPOINTMENT_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    const onAuthExpired = () => {
      refreshAccessToken()
        .then(() => socket.connect()) // the `auth` callback re-reads the new token
        .catch(() => undefined); // the HTTP client handles an expired session
    };
    socket.on(SYNC_EVENT, onSync);
    socket.on(AUTH_EXPIRED_EVENT, onAuthExpired);

    return () => {
      handlers.forEach(([event, handler]) => socket.off(event, handler));
      socket.off(SYNC_EVENT, onSync);
      socket.off(AUTH_EXPIRED_EVENT, onAuthExpired);
      disconnectSocket();
    };
  }, [authed, qc]);
}
