import { useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentsApi, departmentsApi, doctorsApi } from '@/api/services';
import { SlotGrid } from '@/features/scheduler/SlotGrid';
import { DoctorSelector, type DoctorSelection } from '@/features/scheduler/DoctorSelector';
import { axiosError, doctor, inMs, page, renderWithProviders } from './utils';
import type { Slot } from '@/types';

vi.mock('@/api/services');

const slots = vi.mocked(appointmentsApi.slots);
const available = inMs(3_600_000);
const mixed: Slot[] = [
  { start: inMs(-3_600_000), status: 'AVAILABLE' }, // in the past: disabled even though the server says available
  { start: available, status: 'AVAILABLE' },
  { start: inMs(7_200_000), status: 'BOOKED' },
  { start: inMs(10_800_000), status: 'UNAVAILABLE' },
];

const renderGrid = (props: Partial<React.ComponentProps<typeof SlotGrid>> = {}) =>
  renderWithProviders(<SlotGrid doctorId="d1" date="2026-10-15" selected="" onSelect={vi.fn()} {...props} />);

describe('SlotGrid', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders available, booked, unavailable and past slots, with text for every non-available state', async () => {
    slots.mockResolvedValue(mixed);
    renderGrid();
    const group = await screen.findByRole('group', { name: 'Time slots' });
    const buttons = within(group).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((b) => !b.disabled)).toHaveLength(1);
    expect(within(group).getByText('Past')).toBeInTheDocument();
    expect(within(group).getByText('Booked')).toBeInTheDocument();
    expect(within(group).getByText('Unavailable')).toBeInTheDocument();
    expect(slots).toHaveBeenCalledWith('d1', '2026-10-15', expect.anything());
  });

  it('lets the user pick only an available slot', async () => {
    slots.mockResolvedValue(mixed);
    const onSelect = vi.fn();
    renderGrid({ onSelect });
    const group = await screen.findByRole('group', { name: 'Time slots' });
    const buttons = within(group).getAllByRole('button') as HTMLButtonElement[];
    for (const b of buttons.filter((x) => x.disabled)) await userEvent.click(b);
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(buttons.find((b) => !b.disabled)!);
    expect(onSelect).toHaveBeenCalledWith(available);
  });

  it('marks the selected slot', async () => {
    slots.mockResolvedValue(mixed);
    renderGrid({ selected: available });
    const group = await screen.findByRole('group', { name: 'Time slots' });
    const pressed = within(group).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
  });

  it('treats the backend as authoritative: a selected slot that is now booked is dropped with a notice', async () => {
    slots.mockResolvedValue([{ start: available, status: 'BOOKED' }]);
    const onSelect = vi.fn();
    renderGrid({ selected: available, onSelect });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(''));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
  });

  it('shows a loading skeleton while slots load', () => {
    slots.mockReturnValue(new Promise(() => {}));
    renderGrid();
    expect(screen.getByRole('status', { name: 'Loading slots' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no slots', async () => {
    slots.mockResolvedValue([]);
    renderGrid();
    expect(await screen.findByText('No slots on this date')).toBeInTheDocument();
  });

  it('asks for a doctor first', () => {
    renderGrid({ doctorId: undefined });
    expect(screen.getByText('Select a doctor')).toBeInTheDocument();
    expect(slots).not.toHaveBeenCalled();
  });

  it('shows a safe error with retry', async () => {
    slots.mockRejectedValueOnce(axiosError(500, { message: 'stack trace: secret internals' })).mockResolvedValue(mixed);
    renderGrid();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/server ran into a problem/i);
    expect(alert).not.toHaveTextContent(/secret internals/);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'Time slots' })).toBeInTheDocument();
  });
});

describe('DoctorSelector', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(departmentsApi.list).mockResolvedValue(page([{ id: 'dept1', name: 'Cardiology' }, { id: 'dept2', name: 'Neurology' }]));
    vi.mocked(doctorsApi.list).mockResolvedValue(page([doctor]));
  });

  function Harness({ onChange }: { onChange: (v: DoctorSelection) => void }) {
    const [v, setV] = useState<DoctorSelection>({ departmentId: '', doctor: null });
    return <DoctorSelector value={v} onChange={(n) => { setV(n); onChange(n); }} allowAllDepartments={false} layout="stack" />;
  }

  it('filters doctors by department and only enables the doctor list after a department is chosen', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    expect(screen.getByLabelText(/^doctor/i)).toBeDisabled();
    expect(doctorsApi.list).not.toHaveBeenCalled();

    await screen.findByRole('option', { name: 'Neurology' });
    await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'dept1');
    await screen.findByRole('option', { name: /dr\. asha rao/i });
    expect(doctorsApi.list).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'dept1' }), expect.anything());

    await userEvent.selectOptions(screen.getByLabelText(/^doctor/i), 'd1');
    expect(onChange).toHaveBeenLastCalledWith({ departmentId: 'dept1', doctor });
  });

  it('clears the doctor when the department changes', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    await screen.findByRole('option', { name: 'Neurology' });
    await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'dept1');
    await screen.findByRole('option', { name: /dr\. asha rao/i });
    await userEvent.selectOptions(screen.getByLabelText(/^doctor/i), 'd1');
    await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'dept2');
    expect(onChange).toHaveBeenLastCalledWith({ departmentId: 'dept2', doctor: null });
  });
});
