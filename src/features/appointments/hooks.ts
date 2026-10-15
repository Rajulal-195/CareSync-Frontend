import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { appointmentsApi, dashboardApi, type AppointmentEditInput, type AppointmentQuery, type BookAppointmentInput } from '@/api/services';
import { ALL_APPOINTMENT_KEYS } from '@/api/events';
import { toApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';
import { normalizeStats } from '@/features/dashboard/stats';
import type { Appointment, AppointmentStatus } from '@/types';

/** After any successful mutation: lists, the open detail, slot grids and dashboard stats all refetch. */
export function invalidateAppointmentCaches(qc: QueryClient) {
  ALL_APPOINTMENT_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
}

export function useAppointments(q: AppointmentQuery, scope: 'all' | 'mine' = 'all', enabled = true) {
  return useQuery({
    queryKey: ['appointments', scope, q],
    queryFn: ({ signal }) => (scope === 'mine' ? appointmentsApi.mine(q, signal) : appointmentsApi.list(q, signal)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Detail view: shows the row from the list immediately, then refreshes from the server. */
export function useAppointment(id: string | undefined, preview?: Appointment) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: ({ signal }) => appointmentsApi.get(id!, signal),
    enabled: !!id,
    staleTime: 0,
    placeholderData: preview,
  });
}

/** Stats come straight from GET /dashboard/stats; nothing is derived from paged appointment data. */
export function useDashboardStats() {
  return useQuery({ queryKey: ['dashboard', 'stats'], queryFn: dashboardApi.stats, select: normalizeStats });
}

export type ForwardStatus = Exclude<AppointmentStatus, 'SCHEDULED' | 'CANCELLED'>;

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ForwardStatus }) => appointmentsApi.updateStatus(id, status),
    onSuccess: (_a, v) => {
      toast.success(`Appointment marked ${v.status.toLowerCase()}.`);
      invalidateAppointmentCaches(qc);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });
}

/** Logical cancellation via the backend's cancel endpoint. The record is never deleted. */
export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => appointmentsApi.cancel(id, reason),
    onSuccess: () => {
      toast.success('Appointment cancelled.');
      invalidateAppointmentCaches(qc);
    },
  });
}

export function useEditAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AppointmentEditInput }) => appointmentsApi.update(id, input),
    onSuccess: () => {
      toast.success('Appointment updated.');
      invalidateAppointmentCaches(qc);
    },
  });
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookAppointmentInput) => appointmentsApi.book(input),
    onSuccess: () => {
      toast.success('Appointment booked.');
      invalidateAppointmentCaches(qc);
    },
  });
}
