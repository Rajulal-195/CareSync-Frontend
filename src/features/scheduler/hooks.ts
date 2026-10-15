import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi } from '@/api/services';
import { connectSocket } from '@/api/socket';
import { useAuthStore } from '@/stores/authStore';

/** Slots always come from the backend; stale data is never trusted for long. */
export function useSlots(doctorId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['slots', doctorId, date],
    queryFn: ({ signal }) => appointmentsApi.slots(doctorId!, date!, signal),
    enabled: !!doctorId && !!date,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Keeps the slot grid live. The server decides which rooms a socket joins (admins and receptionists get
 * every `slot:updated` / `appointment:*` event), so nothing needs to be subscribed to here; the refetch
 * itself is triggered by the app-wide handler (see useLiveAppointments). This hook only makes sure the
 * socket is open and refetches this doctor's slots on every (re)connect.
 */
export function useLiveSlots(doctorId: string | undefined, date: string | undefined) {
  const qc = useQueryClient();
  const authed = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    if (!authed || !doctorId || !date) return;
    const socket = connectSocket();
    if (!socket) return;
    const refetch = () => qc.invalidateQueries({ queryKey: ['slots', doctorId] });
    socket.on('connect', refetch);
    return () => {
      socket.off('connect', refetch);
    };
  }, [authed, doctorId, date, qc]);
}
