import { StrictMode } from 'react';
import { useLiveAppointments } from '@/hooks/useLiveAppointments';
import { useLiveSlots } from '@/features/scheduler/hooks';
import { connectSocket, disconnectSocket } from '@/api/socket';
import { toast, useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { makeQueryClient, renderWithProviders, signIn } from './utils';

type Handler = (payload?: unknown) => void;

// A fake socket that records listeners, so tests can emit events and check cleanup.
const fake = vi.hoisted(() => {
  const handlers = new Map<string, Set<Handler>>();
  const ioHandlers = new Map<string, Set<Handler>>();
  const add = (m: Map<string, Set<Handler>>, e: string, h: Handler) => {
    if (!m.has(e)) m.set(e, new Set());
    m.get(e)!.add(h);
  };
  const socket = {
    connected: false,
    on: vi.fn((e: string, h: Handler) => add(handlers, e, h)),
    off: vi.fn((e: string, h: Handler) => handlers.get(e)?.delete(h)),
    emit: vi.fn(),
    connect: vi.fn(),
    io: {
      on: vi.fn((e: string, h: Handler) => add(ioHandlers, e, h)),
      off: vi.fn((e: string, h: Handler) => ioHandlers.get(e)?.delete(h)),
    },
  };
  return { socket, handlers, ioHandlers };
});

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => fake.socket),
  disconnectSocket: vi.fn(),
}));
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), refreshAccessToken: vi.fn().mockResolvedValue('new-token') }));

// Event names exactly as the backend emits them (sockets/realtime.ts, sockets/index.ts).
const APPOINTMENT_AND_SLOT_EVENTS = ['appointment:created', 'appointment:updated', 'appointment:cancelled', 'appointment:status-changed', 'slot:updated'];
const EVENTS = [...APPOINTMENT_AND_SLOT_EVENTS, 'sync:required', 'auth:expired'];
const emit = (event: string, payload?: unknown) => fake.handlers.get(event)?.forEach((h) => h(payload));
const toasts = () => useToastStore.getState().toasts;

function Probe() {
  useLiveAppointments();
  return null;
}
function SlotsProbe() {
  useLiveSlots('d1', '2026-10-15');
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.handlers.clear();
  fake.ioHandlers.clear();
  fake.socket.connected = false;
  signIn('RECEPTIONIST');
});

describe('live appointment updates', () => {
  it('registers exactly one listener per event and removes them all on unmount', () => {
    const { unmount } = renderWithProviders(<Probe />);
    expect(fake.socket.on.mock.calls.map((c) => c[0]).sort()).toEqual([...EVENTS].sort());

    unmount();
    expect(fake.socket.off).toHaveBeenCalledTimes(EVENTS.length);
    for (const e of EVENTS) expect(fake.handlers.get(e)?.size ?? 0).toBe(0);
    expect(disconnectSocket).toHaveBeenCalledTimes(1);
  });

  it("leaves no duplicate listeners after React StrictMode's double mount", () => {
    renderWithProviders(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    for (const e of EVENTS) expect(fake.handlers.get(e)?.size).toBe(1);
  });

  it('does not connect without a signed-in session', () => {
    useAuthStore.setState({ user: null, accessToken: null });
    renderWithProviders(<Probe />);
    expect(connectSocket).not.toHaveBeenCalled();
    expect(fake.socket.on).not.toHaveBeenCalled();
  });

  it('refetches from the API instead of trusting the payload', () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<Probe />, { queryClient });

    emit('appointment:created', { doctorId: 'd1', patientName: 'Not Trusted', status: 'COMPLETED' });

    for (const queryKey of [['appointments'], ['appointment'], ['dashboard'], ['slots', 'd1']]) {
      expect(spy).toHaveBeenCalledWith({ queryKey });
    }
    expect(queryClient.getQueryData(['appointments'])).toBeUndefined(); // nothing was written to the cache
  });

  it.each(['appointment:updated', 'appointment:cancelled', 'appointment:status-changed'])('%s refreshes lists, detail, dashboard and slots', (event) => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<Probe />, { queryClient });
    emit(event);
    for (const queryKey of [['appointments'], ['appointment'], ['dashboard'], ['slots']]) {
      expect(spy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('narrows slot refreshes to the doctor named in a slot:updated event, silently', () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<Probe />, { queryClient });
    emit('slot:updated', { doctorId: 'd2' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['slots', 'd2'] });
    expect(toasts()).toHaveLength(0);
  });

  it('refetches everything when the server asks for a sync (sent on every connect; events are not replayed)', () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<Probe />, { queryClient });
    emit('sync:required', { serverTime: '2026-10-15T00:00:00.000Z' });
    for (const queryKey of [['appointments'], ['appointment'], ['slots'], ['dashboard']]) {
      expect(spy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('refreshes the token and reconnects when the server drops the socket for an expired token', async () => {
    renderWithProviders(<Probe />);
    emit('auth:expired');
    await vi.waitFor(() => expect(fake.socket.connect).toHaveBeenCalledTimes(1));
  });
});

describe('live update notices', () => {
  it('uses fixed generic wording and never shows patient details from the payload', () => {
    renderWithProviders(<Probe />);
    emit('appointment:cancelled', { patientName: 'SECRET NAME', phone: '9999900000', reason: 'private' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].message).toBe('An appointment was cancelled.');
    expect(JSON.stringify(toasts())).not.toMatch(/SECRET|9999900000|private/);
  });

  it('does not stack duplicate toasts for repeated events', () => {
    renderWithProviders(<Probe />);
    emit('appointment:created');
    emit('appointment:created');
    emit('appointment:created');
    expect(toasts()).toHaveLength(1);
  });

  it("skips the notice when it would only echo the user's own action", () => {
    renderWithProviders(<Probe />);
    toast.success('Appointment booked.');
    emit('appointment:created');
    expect(toasts().map((t) => t.message)).toEqual(['Appointment booked.']);
  });

  it('writes nothing to the console', () => {
    renderWithProviders(<Probe />);
    // Spy only after rendering, so unrelated React dev warnings can't make this flaky.
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    emit('appointment:created', { patientName: 'SECRET NAME' });
    emit('slot:updated', { doctorId: 'd1' });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});

describe('live slot refresh', () => {
  it('opens the socket for the selected doctor/date, sends nothing (the server assigns rooms), and cleans up', () => {
    fake.socket.connected = true;
    const { unmount } = renderWithProviders(<SlotsProbe />);
    expect(connectSocket).toHaveBeenCalled();
    expect(fake.socket.emit).not.toHaveBeenCalled();

    unmount();
    expect(fake.socket.emit).not.toHaveBeenCalled();
    expect(fake.handlers.get('connect')?.size ?? 0).toBe(0);
  });

  it("refetches the doctor's slots when the socket (re)connects", () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<SlotsProbe />, { queryClient });
    emit('connect');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['slots', 'd1'] });
  });
});
