import { io, type Socket } from 'socket.io-client';
import { refreshAccessToken } from './client';
import { useAuthStore } from '@/stores/authStore';

const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

/** Handshake errors that mean "your token was not accepted" (as opposed to a network problem). */
const AUTH_ERROR = /unauthori[sz]ed|forbidden|jwt|token|auth/i;

let socket: Socket | null = null;

/**
 * Opens the single shared socket, authenticated with the in-memory access token (plus the session
 * cookie). Without a signed-in session this returns null and nothing connects.
 *
 * - The `auth` callback re-reads the latest token on every (re)connect attempt, so reconnects after a
 *   silent token refresh use the new token.
 * - If the server rejects the handshake as unauthorised, the token is refreshed once and the socket
 *   reconnects; if that fails the socket is closed (the HTTP client handles session expiry).
 * - Nothing is logged: payloads and errors may contain patient information.
 */
export function connectSocket(): Socket | null {
  if (!useAuthStore.getState().accessToken) return null;
  if (socket) return socket;

  const s = io(SOCKET_URL, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
  });

  let retriedAuth = false;
  s.on('connect', () => {
    retriedAuth = false;
  });
  s.on('connect_error', (err) => {
    if (retriedAuth || !AUTH_ERROR.test(err.message)) return; // network errors reconnect automatically
    retriedAuth = true;
    refreshAccessToken()
      .then(() => {
        if (socket === s) s.connect();
      })
      .catch(() => {
        if (socket === s) disconnectSocket();
      });
  });

  socket = s;
  s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
