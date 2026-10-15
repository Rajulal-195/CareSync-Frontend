import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentsApi, departmentsApi, doctorsApi } from '@/api/services';
import type { AppointmentQuery } from '@/api/services';
import { AppointmentList } from '@/features/appointments/AppointmentList';
import { axiosError, doctor, makeAppointment, page, renderWithProviders, signIn } from './utils';

vi.mock('@/api/services');

const list = vi.mocked(appointmentsApi.list);
const mine = vi.mocked(appointmentsApi.mine);
const lastQuery = (): AppointmentQuery => list.mock.calls[list.mock.calls.length - 1][0] as AppointmentQuery;

beforeEach(() => {
  vi.resetAllMocks();
  signIn('RECEPTIONIST');
  vi.mocked(departmentsApi.list).mockResolvedValue(page([{ id: 'dept1', name: 'Cardiology' }]));
  vi.mocked(doctorsApi.list).mockResolvedValue(page([doctor]));
  list.mockResolvedValue(page([makeAppointment()], { total: 25, totalPages: 3 }));
});

const renderList = (props: Partial<React.ComponentProps<typeof AppointmentList>> = {}) =>
  renderWithProviders(<AppointmentList manage {...props} />);

describe('AppointmentList: server-side query', () => {
  it('loads the first page sorted by time, newest first', async () => {
    renderList();
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    expect(list.mock.calls[0][0]).toMatchObject({ page: 1, limit: 10, sortBy: 'scheduledAt', sortOrder: 'desc' });
    expect(screen.getByRole('columnheader', { name: /time/i })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('paginates on the server', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('changes the page size and returns to page 1', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.selectOptions(screen.getByLabelText('Rows'), '25');
    await waitFor(() => expect(lastQuery()).toMatchObject({ limit: 25, page: 1 }));
  });

  it('sends status, department and date-range filters and resets to page 1', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'ARRIVED');
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: 'ARRIVED', page: 1 }));

    await screen.findByRole('option', { name: 'Cardiology' });
    await userEvent.selectOptions(screen.getByLabelText('Filter by department'), 'dept1');
    await waitFor(() => expect(lastQuery()).toMatchObject({ departmentId: 'dept1' }));

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ from: '2026-10-01', to: '2026-10-31', status: 'ARRIVED', departmentId: 'dept1' }));
  });

  it('debounces free-text search (patient name, ID or mobile)', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    await userEvent.type(screen.getByLabelText(/search by patient name/i), 'ravi');
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: 'ravi', page: 1 }));
    expect(list.mock.calls.some((c) => (c[0] as AppointmentQuery).search === 'r')).toBe(false);
  });

  it('sorts on the server when a header is clicked, toggling direction', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    // Only the columns the backend can sort by (appointmentDate/startTime and status) are sortable.
    expect(screen.queryByRole('button', { name: 'Patient' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: 'status', sortOrder: 'asc', page: 1 }));
    expect(screen.getByRole('columnheader', { name: /status/i })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: 'status', sortOrder: 'desc' }));
  });

  it('filters by doctor on the server', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    await screen.findByRole('option', { name: 'Dr. Asha Rao' });
    await userEvent.selectOptions(screen.getByLabelText('Filter by doctor'), 'd1');
    await waitFor(() => expect(lastQuery()).toMatchObject({ doctorId: 'd1', page: 1 }));
  });

  it('does not query with an end date before the start date', async () => {
    renderList();
    await screen.findByText('Ravi Kumar');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-10' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/start date must be on or before the end date/i);
    expect(list.mock.calls.every((c) => !((c[0] as AppointmentQuery).from === '2026-10-20' && (c[0] as AppointmentQuery).to === '2026-10-10'))).toBe(true);
  });

  it("uses the doctor-scoped endpoint and no department filter for a doctor's own list", async () => {
    signIn('DOCTOR');
    mine.mockResolvedValue(page([makeAppointment()]));
    renderList({ scope: 'mine', showDoctor: false });
    await screen.findByText('Ravi Kumar');
    expect(mine).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Filter by department')).not.toBeInTheDocument();
  });
});

describe('AppointmentList: loading, empty and error states', () => {
  it('shows a loading state', () => {
    list.mockReturnValue(new Promise(() => {}));
    renderList();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('distinguishes "no appointments" from "nothing matches your filters", and clears filters', async () => {
    list.mockResolvedValue(page([]));
    renderList();
    expect(await screen.findByText('No appointments yet')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'ARRIVED');
    expect(await screen.findByText('No appointments match your filters')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(await screen.findByText('No appointments yet')).toBeInTheDocument();
    expect(lastQuery().status).toBeUndefined();
  });

  it('shows a safe error and recovers on retry', async () => {
    list.mockRejectedValueOnce(axiosError(500, { message: 'internal stack trace' })).mockResolvedValue(page([makeAppointment()]));
    renderList();
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/server ran into a problem/i)).toBeInTheDocument();
    expect(screen.queryByText(/stack trace/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
  });
});
