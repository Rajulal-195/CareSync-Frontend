import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentsApi, departmentsApi, doctorsApi, patientsApi } from '@/api/services';
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal';
import { axiosError, deferred, doctor, inMs, makeAppointment, page, patient, renderWithProviders, signIn } from './utils';
import type { Appointment } from '@/types';

vi.mock('@/api/services');

const slotStart = inMs(3_600_000);
const book = vi.mocked(appointmentsApi.book);
const slotsApi = vi.mocked(appointmentsApi.slots);

beforeEach(() => {
  vi.resetAllMocks();
  signIn('RECEPTIONIST');
  vi.mocked(departmentsApi.list).mockResolvedValue(page([{ id: 'dept1', name: 'Cardiology' }]));
  vi.mocked(doctorsApi.list).mockResolvedValue(page([doctor]));
  slotsApi.mockResolvedValue([
    { start: slotStart, status: 'AVAILABLE' },
    { start: inMs(7_200_000), status: 'BOOKED' },
  ]);
  vi.mocked(patientsApi.search).mockResolvedValue(page([patient]));
});

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }));
const confirmButton = () => screen.findByRole('button', { name: 'Confirm booking' });

async function chooseDoctor() {
  await screen.findByRole('option', { name: 'Cardiology' });
  await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'dept1');
  await screen.findByRole('option', { name: /dr\. asha rao/i });
  await userEvent.selectOptions(screen.getByLabelText(/^doctor/i), 'd1');
}
async function chooseSlot() {
  const group = await screen.findByRole('group', { name: 'Time slots' });
  const free = (within(group).getAllByRole('button') as HTMLButtonElement[]).find((b) => !b.disabled)!;
  await userEvent.click(free);
}
async function choosePatient() {
  await userEvent.type(screen.getByLabelText(/search patients/i), 'ravi');
  await userEvent.click(await screen.findByRole('button', { name: /ravi kumar/i }));
}
async function walkToConfirm(reason = 'Chest pain') {
  await chooseDoctor(); await next();
  await chooseSlot(); await next();
  await choosePatient(); await next();
  await userEvent.type(screen.getByLabelText(/purpose of visit/i), reason);
  await userEvent.click(screen.getByRole('button', { name: 'Review & continue' }));
  await confirmButton();
}
const openWizard = () => renderWithProviders(<BookAppointmentModal open onClose={vi.fn()} />);

describe('booking wizard: step validation', () => {
  it('blocks each step until its required fields are filled', { timeout: 20_000 }, async () => {
    openWizard();

    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent('Select a department.');

    await screen.findByRole('option', { name: 'Cardiology' });
    await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'dept1');
    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent('Select a doctor.');

    await screen.findByRole('option', { name: /dr\. asha rao/i });
    await userEvent.selectOptions(screen.getByLabelText(/^doctor/i), 'd1');
    await next();
    await screen.findByRole('group', { name: 'Time slots' });

    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent('Select an available time slot.');
    await chooseSlot();
    await next();

    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent('Select an existing patient or register a new one.');
    await choosePatient();
    await next();

    await userEvent.click(screen.getByRole('button', { name: 'Review & continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/purpose of the visit/i);
    expect(book).not.toHaveBeenCalled();
  });

  it('keeps entered values when moving back and forward', { timeout: 20_000 }, async () => {
    openWizard();
    await chooseDoctor(); await next();
    await chooseSlot(); await next();
    await choosePatient();

    await userEvent.click(screen.getByRole('button', { name: 'Back' })); // slot step
    await userEvent.click(screen.getByRole('button', { name: 'Back' })); // doctor step
    // The selects remount and reload their options, so wait for them rather than asserting instantly.
    await waitFor(() => expect(screen.getByLabelText(/^department/i)).toHaveValue('dept1'));
    await waitFor(() => expect(screen.getByLabelText(/^doctor/i)).toHaveValue('d1'));

    await next();
    const group = await screen.findByRole('group', { name: 'Time slots' });
    expect(within(group).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);

    await next();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument(); // patient still selected
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('opens at the first incomplete step when pre-filled from the scheduler', async () => {
    renderWithProviders(
      <BookAppointmentModal
        open
        onClose={vi.fn()}
        initialPatient={patient}
        initial={{ departmentId: 'dept1', doctor, date: '2026-10-15', slot: slotStart }}
      />,
    );
    expect(await screen.findByLabelText(/purpose of visit/i)).toBeInTheDocument();
  });
});

describe('booking wizard: submission', () => {
  it('shows the confirmation only after the backend confirms, with the exact payload', { timeout: 20_000 }, async () => {
    const d = deferred<Appointment>();
    book.mockReturnValue(d.promise);
    openWizard();
    await walkToConfirm('Chest pain');

    await userEvent.click(await confirmButton());
    await waitFor(() =>
      expect(book).toHaveBeenCalledWith({ patientId: 'p1', doctorId: 'd1', scheduledAt: slotStart, reason: 'Chest pain' }),
    );
    expect(screen.queryByText(/confirmed by the server/i)).not.toBeInTheDocument();

    d.resolve(makeAppointment({ id: 'appt-77' }));
    expect(await screen.findByText(/confirmed by the server/i)).toBeInTheDocument();
    expect(screen.getByText('appt-77')).toBeInTheDocument();
  });

  it('prevents duplicate submissions', { timeout: 20_000 }, async () => {
    const d = deferred<Appointment>();
    book.mockReturnValue(d.promise);
    openWizard();
    await walkToConfirm();

    await userEvent.dblClick(await confirmButton());
    expect(book).toHaveBeenCalledTimes(1);
    d.resolve(makeAppointment());
    await screen.findByText(/confirmed by the server/i);
    expect(book).toHaveBeenCalledTimes(1);
  });

  it('handles a 409 double-booking: refreshes slots, clears the choice and never shows a confirmation', { timeout: 20_000 }, async () => {
    book.mockRejectedValue(axiosError(409, { message: 'Slot already booked' }));
    openWizard();
    await walkToConfirm();
    const slotCallsBefore = slotsApi.mock.calls.length;

    await userEvent.click(await confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/just booked by someone else/i);
    expect(alert).toHaveTextContent('Slot already booked');
    expect(screen.queryByText(/confirmed by the server/i)).not.toBeInTheDocument();

    const group = await screen.findByRole('group', { name: 'Time slots' }); // sent back to the slot step
    expect(within(group).queryAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    await waitFor(() => expect(slotsApi.mock.calls.length).toBeGreaterThan(slotCallsBefore));

    await next();
    expect(await screen.findByText('Select an available time slot.')).toBeInTheDocument();
  });

  it('shows a safe message for other failures and stays on the confirm step', { timeout: 20_000 }, async () => {
    book.mockRejectedValue(axiosError(500, { message: 'internal stack trace' }));
    openWizard();
    await walkToConfirm();
    await userEvent.click(await confirmButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/server ran into a problem/i);
    expect(alert).not.toHaveTextContent(/stack trace/);
    expect(screen.queryByText(/confirmed by the server/i)).not.toBeInTheDocument();
    expect(await confirmButton()).toBeEnabled(); // the user can retry
  });
});

describe('booking wizard: patients', () => {
  it('registers a new patient when no existing patient matches, then continues with them', { timeout: 20_000 }, async () => {
    vi.mocked(patientsApi.search).mockResolvedValue(page([]));
    vi.mocked(patientsApi.create).mockResolvedValue({ id: 'p2', patientCode: 'PT-1002', name: 'New Person', phone: '9876543210' });
    openWizard();
    await chooseDoctor(); await next();
    await chooseSlot(); await next();

    await userEvent.type(screen.getByLabelText(/search patients/i), 'nobody');
    const [register] = await screen.findAllByRole('button', { name: /register new patient/i });
    await userEvent.click(register);

    await userEvent.type(await screen.findByLabelText(/full name/i), 'New Person');
    await userEvent.type(screen.getByLabelText(/mobile/i), '9876543210');
    await userEvent.click(screen.getByRole('button', { name: 'Register patient' }));

    expect(await screen.findByText('New Person')).toBeInTheDocument();
    expect(patientsApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Person', phone: '9876543210' }));
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });
});
