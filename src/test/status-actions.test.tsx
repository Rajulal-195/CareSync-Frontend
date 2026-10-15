import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { appointmentsApi } from '@/api/services';
import { AppointmentTable } from '@/features/appointments/AppointmentTable';
import { useToastStore } from '@/stores/toastStore';
import { axiosError, makeAppointment, makeQueryClient, renderWithProviders, signIn } from './utils';
import type { AppointmentStatus, Role } from '@/types';

vi.mock('@/api/services');

const api = vi.mocked(appointmentsApi);
const ALL_LABELS = ['Mark arrived', 'Complete', 'Cancel'];
const CACHE_KEYS = [['appointments'], ['appointment'], ['slots'], ['dashboard']];

beforeEach(() => {
  vi.resetAllMocks();
  signIn('RECEPTIONIST');
});

function renderTable(status: AppointmentStatus = 'SCHEDULED', manage = true) {
  const queryClient = makeQueryClient();
  const spy = vi.spyOn(queryClient as QueryClient, 'invalidateQueries');
  renderWithProviders(<AppointmentTable items={[makeAppointment({ status })]} manage={manage} />, { queryClient });
  return spy;
}

const expectCachesInvalidated = async (spy: ReturnType<typeof renderTable>) => {
  for (const queryKey of CACHE_KEYS) await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey }));
};
const toastMessages = () => useToastStore.getState().toasts.map((t) => t.message);

describe('status actions: what each role can do', () => {
  it.each<[Role, AppointmentStatus, string[]]>([
    ['RECEPTIONIST', 'SCHEDULED', ['Mark arrived', 'Cancel']],
    ['RECEPTIONIST', 'ARRIVED', ['Cancel']],
    ['RECEPTIONIST', 'COMPLETED', []],
    ['RECEPTIONIST', 'CANCELLED', []],
    ['DOCTOR', 'SCHEDULED', []],
    ['DOCTOR', 'ARRIVED', ['Complete']],
    ['SUPER_ADMIN', 'ARRIVED', []],
    ['SUPER_ADMIN', 'COMPLETED', []],
  ])('%s on a %s appointment sees %j', (role, status, expected) => {
    signIn(role);
    renderTable(status);
    for (const label of ALL_LABELS) {
      const button = screen.queryByRole('button', { name: label });
      if (expected.includes(label)) expect(button).toBeInTheDocument();
      else expect(button).not.toBeInTheDocument();
    }
  });

  it('shows no status actions when the table is read-only', () => {
    renderTable('SCHEDULED', false);
    for (const label of ALL_LABELS) expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view appointment/i })).toBeInTheDocument();
  });

  it('always shows the status as text', () => {
    renderTable('ARRIVED');
    expect(screen.getByText('Arrived')).toBeInTheDocument();
  });
});

describe('status actions: API calls and cache invalidation', () => {
  it('marks arrived through the status endpoint and refreshes related caches', async () => {
    api.updateStatus.mockResolvedValue(makeAppointment({ status: 'ARRIVED' }));
    const spy = renderTable('SCHEDULED');
    await userEvent.click(screen.getByRole('button', { name: 'Mark arrived' }));
    await waitFor(() => expect(api.updateStatus).toHaveBeenCalledWith('a1', 'ARRIVED'));
    await expectCachesInvalidated(spy);
    expect(toastMessages()).toContain('Appointment marked arrived.');
  });

  it('lets a doctor complete an arrived appointment', async () => {
    signIn('DOCTOR');
    api.updateStatus.mockResolvedValue(makeAppointment({ status: 'COMPLETED' }));
    const spy = renderTable('ARRIVED');
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(api.updateStatus).toHaveBeenCalledWith('a1', 'COMPLETED'));
    await expectCachesInvalidated(spy);
  });

  it('reports a failed status change without refreshing caches', async () => {
    api.updateStatus.mockRejectedValue(axiosError(409, { message: 'Appointment is already completed' }));
    const spy = renderTable('SCHEDULED');
    await userEvent.click(screen.getByRole('button', { name: 'Mark arrived' }));
    await waitFor(() => expect(toastMessages()).toContain('Appointment is already completed'));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('cancellation (logical, with confirmation)', () => {
  const openDialog = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    return screen.findByRole('dialog', { name: 'Cancel appointment' });
  };

  it('asks for confirmation and does nothing until confirmed', async () => {
    renderTable('SCHEDULED');
    const dialog = await openDialog();
    expect(within(dialog).getByText(/the record is kept/i)).toBeInTheDocument();
    expect(api.cancel).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep appointment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('calls the cancel endpoint (not a delete) with the optional reason, then refreshes caches', async () => {
    api.cancel.mockResolvedValue(makeAppointment({ status: 'CANCELLED' }));
    const spy = renderTable('SCHEDULED');
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Patient request');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('a1', 'Patient request'));
    await expectCachesInvalidated(spy);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMessages()).toContain('Appointment cancelled.');
  });

  it('sends no reason when none is typed', async () => {
    api.cancel.mockResolvedValue(makeAppointment({ status: 'CANCELLED' }));
    renderTable('SCHEDULED');
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('a1', undefined));
  });

  it('keeps the dialog open with a safe message if cancelling fails', async () => {
    api.cancel.mockRejectedValue(axiosError(500, { message: 'internal stack trace' }));
    const spy = renderTable('SCHEDULED');
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/server ran into a problem/i);
    expect(screen.getByRole('dialog', { name: 'Cancel appointment' })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('appointment details and editing', () => {
  const view = async () => {
    await userEvent.click(screen.getByRole('button', { name: /view appointment for ravi kumar/i }));
    return screen.findByRole('dialog', { name: 'Appointment details' });
  };

  it('shows patient details refreshed from the server', async () => {
    api.get.mockResolvedValue(makeAppointment({ notes: 'BP slightly high' }));
    renderTable('SCHEDULED');
    const dialog = await view();
    expect(within(dialog).getByText('PT-1001')).toBeInTheDocument();
    expect(within(dialog).getByText('9999900000')).toBeInTheDocument();
    expect(await within(dialog).findByText('BP slightly high')).toBeInTheDocument();
  });

  it('edits the permitted fields and refreshes caches', async () => {
    api.get.mockResolvedValue(makeAppointment());
    api.update.mockResolvedValue(makeAppointment({ reason: 'Follow-up visit' }));
    const spy = renderTable('SCHEDULED');
    const dialog = await view();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    const reason = within(dialog).getByLabelText(/purpose of visit/i);
    await userEvent.clear(reason);
    await userEvent.type(reason, 'Follow-up visit');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('a1', { reason: 'Follow-up visit', notes: '' }));
    await expectCachesInvalidated(spy);
  });

  it('lets a doctor edit consultation notes only', async () => {
    signIn('DOCTOR');
    api.get.mockResolvedValue(makeAppointment({ status: 'ARRIVED' }));
    api.update.mockResolvedValue(makeAppointment({ status: 'ARRIVED', consultationNotes: 'Stable' }));
    renderTable('ARRIVED');
    const dialog = await view();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    expect(within(dialog).queryByLabelText(/purpose of visit/i)).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/consultation notes/i), 'Stable');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('a1', { consultationNotes: 'Stable' }));
  });

  it('does not offer editing on a cancelled appointment', async () => {
    api.get.mockResolvedValue(makeAppointment({ status: 'CANCELLED' }));
    renderTable('CANCELLED');
    const dialog = await view();
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('explains a 404 on refresh and keeps showing the last known details', async () => {
    api.get.mockRejectedValue(axiosError(404));
    renderTable('SCHEDULED');
    const dialog = await view();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/find that record/i);
    expect(within(dialog).getByText('PT-1001')).toBeInTheDocument();
  });
});
