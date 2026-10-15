import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { Appointment, Doctor, Paginated, Patient, Role } from '@/types';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 }, mutations: { retry: false } },
  });
}

export function renderWithProviders(ui: ReactElement, opts: { route?: string; queryClient?: QueryClient } = {}) {
  const queryClient = opts.queryClient ?? makeQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

/** An axios error carrying an HTTP response, like the ones the real client rejects with. */
export function axiosError(status: number, data: unknown = {}) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

export function signIn(role: Role = 'RECEPTIONIST') {
  useAuthStore.setState({
    user: { id: 'u1', name: 'Test User', email: 'test@example.org', role },
    accessToken: 'test-token',
    initialized: true,
  });
}

export const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

export const page = <T,>(items: T[], meta: Record<string, number> = {}): Paginated<T> => ({
  items,
  meta: { page: 1, limit: 10, total: items.length, totalPages: 1, ...meta },
});

export const doctor: Doctor = {
  id: 'd1',
  name: 'Dr. Asha Rao',
  email: 'asha@example.org',
  specialization: 'Cardiology',
  departmentId: 'dept1',
  department: { id: 'dept1', name: 'Cardiology' },
};

export const patient: Patient = { id: 'p1', patientCode: 'PT-1001', name: 'Ravi Kumar', phone: '9999900000' };

export function makeAppointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    patientId: 'p1',
    doctorId: 'd1',
    patient,
    doctor: { id: 'd1', name: 'Dr. Asha Rao', specialization: 'Cardiology' },
    scheduledAt: inMs(3_600_000),
    reason: 'Routine checkup',
    status: 'SCHEDULED',
    ...over,
  };
}

/** A promise you resolve or reject yourself, to observe in-flight UI states. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
