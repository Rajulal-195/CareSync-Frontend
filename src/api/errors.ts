/**
 * User-facing wording for API failures. Pure (no axios import) so it is trivially testable.
 *
 * Server messages are shown only for 4xx responses, where the backend writes them for users
 * (validation, conflicts). 5xx bodies can carry internals, so they are never displayed.
 */
export const NETWORK_ERROR_MESSAGE = 'Cannot reach the server. Check your connection and try again.';
export const SERVER_ERROR_MESSAGE = 'The server ran into a problem. Please try again in a moment.';

const MAX_SERVER_MESSAGE = 300;

const DEFAULTS: Record<number, string> = {
  400: 'Please check the details you entered and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find that record. It may have been removed.',
  409: 'That conflicts with a recent change. Refresh and try again.',
  422: 'Please check the details you entered and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
};

export function friendlyMessage(status: number | undefined, serverMessage?: unknown): string {
  if (status === undefined) return NETWORK_ERROR_MESSAGE;
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  if (typeof serverMessage === 'string') {
    const m = serverMessage.trim();
    if (m && m.length <= MAX_SERVER_MESSAGE) return m;
  }
  return DEFAULTS[status] ?? `The request could not be completed (error ${status}).`;
}
