import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { patientsApi } from '@/api/services';
import { PatientSearch } from '@/features/patients/PatientSearch';
import { PatientFormModal } from '@/features/patients/PatientFormModal';
import { axiosError, deferred, page, patient, renderWithProviders, signIn } from './utils';
import type { Paginated, Patient } from '@/types';

vi.mock('@/api/services');

const search = vi.mocked(patientsApi.search);
const box = () => screen.getByLabelText(/search patients/i);

describe('PatientSearch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    signIn('RECEPTIONIST');
    search.mockResolvedValue(page([patient]));
  });

  it('waits for enough characters before searching', async () => {
    renderWithProviders(<PatientSearch />);
    await userEvent.type(box(), 'r');
    expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('debounces typing into a single request', async () => {
    renderWithProviders(<PatientSearch />);
    await userEvent.type(box(), 'ravi');
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('ravi', expect.anything());
  });

  it.each(['PT-1001', '9999900000', 'Ravi'])('sends %s (patient ID, mobile or name) to the server as typed', async (term) => {
    renderWithProviders(<PatientSearch />);
    await userEvent.type(box(), term);
    await waitFor(() => expect(search).toHaveBeenCalledWith(term, expect.anything()));
  });

  it('shows a loading indicator while searching', async () => {
    const d = deferred<Paginated<Patient>>();
    search.mockReturnValue(d.promise);
    renderWithProviders(<PatientSearch />);
    await userEvent.type(box(), 'ravi');
    expect(await screen.findByText('Searching…')).toBeInTheDocument();
    d.resolve(page([patient]));
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Searching…')).not.toBeInTheDocument());
  });

  it('lets the user select a result for booking', async () => {
    const onSelect = vi.fn();
    renderWithProviders(<PatientSearch onSelect={onSelect} />);
    await userEvent.type(box(), 'ravi');
    await userEvent.click(await screen.findByRole('button', { name: /ravi kumar/i }));
    expect(onSelect).toHaveBeenCalledWith(patient);
  });

  it('shows ID and mobile in each result', async () => {
    renderWithProviders(<PatientSearch onSelect={vi.fn()} />);
    await userEvent.type(box(), 'ravi');
    expect(await screen.findByText(/PT-1001/)).toBeInTheDocument();
    expect(screen.getByText(/9999900000/)).toBeInTheDocument();
  });

  it('offers registration to a receptionist when nothing matches', async () => {
    search.mockResolvedValue(page([]));
    const onRegister = vi.fn();
    renderWithProviders(<PatientSearch onSelect={vi.fn()} onRegister={onRegister} />);
    await userEvent.type(box(), 'nobody');
    await userEvent.click(await screen.findByRole('button', { name: /register new patient/i }));
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('does not offer registration to a doctor', async () => {
    signIn('DOCTOR');
    search.mockResolvedValue(page([]));
    renderWithProviders(<PatientSearch onSelect={vi.fn()} onRegister={vi.fn()} />);
    await userEvent.type(box(), 'nobody');
    expect(await screen.findByText('No patients found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /register new patient/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ask a receptionist/i)).toBeInTheDocument();
  });

  it('shows a safe error with a retry', async () => {
    search.mockRejectedValueOnce(axiosError(500, { message: 'db password leaked' })).mockResolvedValue(page([patient]));
    renderWithProviders(<PatientSearch onSelect={vi.fn()} />);
    await userEvent.type(box(), 'ravi');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/server ran into a problem/i);
    expect(alert).not.toHaveTextContent(/password/i);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
  });
});

describe('PatientFormModal (new patient)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    signIn('RECEPTIONIST');
  });

  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Register patient' }));

  it('validates required fields before calling the API', async () => {
    renderWithProviders(<PatientFormModal open onClose={vi.fn()} />);
    await submit();
    expect(await screen.findByText(/full name/i, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Enter a valid mobile number (7-15 digits)')).toBeInTheDocument();
    expect(patientsApi.create).not.toHaveBeenCalled();
  });

  it('registers the patient, then reports the created record and closes', async () => {
    const created: Patient = { id: 'p9', patientCode: 'PT-9', name: 'New Person', phone: '9876543210' };
    vi.mocked(patientsApi.create).mockResolvedValue(created);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<PatientFormModal open onClose={onClose} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'New Person');
    await userEvent.type(screen.getByLabelText(/mobile/i), '9876543210');
    await submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(patientsApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Person', phone: '9876543210' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows backend validation errors on the field and keeps the form open', async () => {
    vi.mocked(patientsApi.create).mockRejectedValue(
      // Backend body; its field `mobile` is shown on the form's "Mobile" (`phone`) field.
      axiosError(422, { message: 'Validation failed', error: { code: 'VALIDATION_ERROR', details: [{ path: 'mobile', message: 'Phone already registered' }] } }),
    );
    const onClose = vi.fn();
    renderWithProviders(<PatientFormModal open onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'New Person');
    await userEvent.type(screen.getByLabelText(/mobile/i), '9876543210');
    await submit();
    expect(await screen.findByText('Phone already registered')).toBeInTheDocument();
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
