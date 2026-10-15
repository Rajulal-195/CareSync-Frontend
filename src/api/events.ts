/** Socket.IO events the frontend listens to, and the query caches each one invalidates. */
export const APPOINTMENT_EVENTS = [
  'appointment:created',
  'appointment:updated',
  'appointment:cancelled',
  'appointment:status-changed',
] as const;

export const SLOT_EVENTS = ['slot:updated'] as const;

/** Server hints that are not appointment changes: refetch everything / re-authenticate the socket. */
export const SYNC_EVENT = 'sync:required';
export const AUTH_EXPIRED_EVENT = 'auth:expired';

export const ALL_EVENTS = [...APPOINTMENT_EVENTS, ...SLOT_EVENTS] as const;

export type QueryKeyPrefix = readonly unknown[];

/**
 * Fixed, generic wording for live notices. Deliberately built from the event name only: socket payloads
 * are never read for display, so no patient or appointment details can leak into a notification.
 * Slot changes are silent.
 */
const NOTIFICATIONS: Record<string, string> = {
  'appointment:created': 'A new appointment was booked.',
  'appointment:updated': 'An appointment was updated.',
  'appointment:cancelled': 'An appointment was cancelled.',
  'appointment:status-changed': 'An appointment’s status changed.',
};

export const notificationFor = (event: string): string | null => NOTIFICATIONS[event] ?? null;

/** Every cache that can go stale after appointment or slot activity (used after a reconnect). */
export const ALL_APPOINTMENT_KEYS: QueryKeyPrefix[] = [['appointments'], ['appointment'], ['slots'], ['dashboard']];

const doctorIdOf = (payload: unknown): string | undefined => {
  const id = (payload as { doctorId?: unknown } | null | undefined)?.doctorId;
  return typeof id === 'string' && id ? id : undefined;
};

/**
 * Which query-key prefixes to invalidate for an event. If the payload names a doctor, slot caches are
 * narrowed to that doctor; otherwise all slot caches refetch. Unknown events invalidate nothing.
 */
export function keysToInvalidate(event: string, payload?: unknown): QueryKeyPrefix[] {
  const doctorId = doctorIdOf(payload);
  const slots: QueryKeyPrefix = doctorId ? ['slots', doctorId] : ['slots'];
  if ((SLOT_EVENTS as readonly string[]).includes(event)) return [slots];
  if ((APPOINTMENT_EVENTS as readonly string[]).includes(event)) {
    return [['appointments'], ['appointment'], ['dashboard'], slots];
  }
  return [];
}
