/**
 * Contract tests: every frontend API call is checked against the backend's real routes, methods, field
 * names and response shapes (backend/src/routes, validators and services). Responses below are written
 * in the backend's wire format (`_id`, `appointmentDate`, `purpose`, `mobile`, `meta.pages` …).
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { api } from '@/api/client';
import {
  appointmentsApi, authApi, dashboardApi, departmentsApi, doctorsApi, patientsApi, receptionistsApi, schedulesApi,
  toAppointmentParams,
} from '@/api/services';
import { mapAppointment, mapDaySlots, splitWall, toWall } from '@/api/adapters';
import { useAuthStore } from '@/stores/authStore';

interface Seen { method: string; url: string; params?: Record<string, unknown>; body?: unknown; headers: Record<string, unknown> }
let seen: Seen[];
let reply: (req: Seen) => { status?: number; data?: unknown; meta?: unknown };
const original = api.defaults.adapter;

const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
  const req: Seen = {
    method: String(config.method).toUpperCase(),
    url: String(config.url),
    params: config.params,
    body: config.data ? JSON.parse(config.data as string) : undefined,
    headers: Object.fromEntries(Object.entries(config.headers.toJSON() as Record<string, unknown>)),
  };
  seen.push(req);
  const r = reply(req);
  const status = r.status ?? 200;
  const res = { data: { success: status < 400, message: 'ok', data: r.data, meta: r.meta, ...(status >= 400 ? { error: { code: 'X' } } : {}) }, status, statusText: '', headers: {}, config } as AxiosResponse;
  return status < 400 ? Promise.resolve(res) : Promise.reject(new AxiosError('fail', 'ERR', config, {}, res));
};

const last = () => seen[seen.length - 1];

const apptDoc = {
  _id: 'a1',
  patient: { _id: 'p1', patientId: 'PT-000001', name: 'Ravi Kumar', mobile: '9999900000' },
  doctor: { _id: 'd1', user: { _id: 'u2', name: 'Dr. Asha Rao' }, specialization: 'Cardiology' },
  department: { _id: 'dept1', name: 'Cardiology' },
  appointmentDate: '2026-10-20', startTime: '10:15', endTime: '10:30',
  purpose: 'Chest pain', notes: 'n', consultationNotes: 'c', status: 'SCHEDULED',
};

beforeEach(() => {
  seen = [];
  reply = () => ({ data: apptDoc });
  api.defaults.adapter = adapter;
  useAuthStore.setState({ user: null, accessToken: 'tok', csrfToken: 'csrf-1', initialized: true });
});
afterEach(() => { api.defaults.adapter = original; });

describe('appointments: routes and payloads', () => {
  it('books with appointmentDate/startTime/purpose (not scheduledAt/reason)', async () => {
    const a = await appointmentsApi.book({ patientId: 'p1', doctorId: 'd1', scheduledAt: '2026-10-20T10:15:00', reason: 'Chest pain' });
    expect(last()).toMatchObject({ method: 'POST', url: '/appointments', body: { patientId: 'p1', doctorId: 'd1', appointmentDate: '2026-10-20', startTime: '10:15', purpose: 'Chest pain' } });
    expect(last().body).not.toHaveProperty('scheduledAt');
    expect(last().body).not.toHaveProperty('reason');
    expect(a).toMatchObject({ id: 'a1', scheduledAt: '2026-10-20T10:15:00', reason: 'Chest pain' });
  });

  it('maps a backend appointment to the UI shape', () => {
    expect(mapAppointment(apptDoc)).toEqual({
      id: 'a1', patientId: 'p1', doctorId: 'd1',
      patient: { id: 'p1', patientCode: 'PT-000001', name: 'Ravi Kumar', phone: '9999900000', email: null, dateOfBirth: null, gender: null },
      doctor: { id: 'd1', name: 'Dr. Asha Rao', specialization: 'Cardiology' },
      department: { id: 'dept1', name: 'Cardiology' },
      scheduledAt: '2026-10-20T10:15:00', endsAt: '2026-10-20T10:30:00',
      reason: 'Chest pain', notes: 'n', consultationNotes: 'c', cancelReason: null, status: 'SCHEDULED', updatedAt: undefined,
    });
  });

  it('tolerates unpopulated references', () => {
    const a = mapAppointment({ ...apptDoc, patient: 'p9', doctor: 'd9', department: 'x' });
    expect([a.patientId, a.doctorId, a.patient, a.doctor]).toEqual(['p9', 'd9', undefined, undefined]);
  });

  it('lists with backend query names, a 2+ char search and backend sort fields; maps meta.pages', async () => {
    reply = () => ({ data: [apptDoc], meta: { page: 2, limit: 10, total: 25, pages: 3 } });
    const r = await appointmentsApi.list({ search: 'ravi', from: '2026-10-01', to: '2026-10-31', status: 'ARRIVED', departmentId: 'dept1', doctorId: 'd1', page: 2, limit: 10, sortBy: 'scheduledAt', sortOrder: 'desc' });
    expect(last()).toMatchObject({ method: 'GET', url: '/appointments', params: { q: 'ravi', dateFrom: '2026-10-01', dateTo: '2026-10-31', status: 'ARRIVED', departmentId: 'dept1', doctorId: 'd1', page: 2, limit: 10, sortBy: 'appointmentDate', sortOrder: 'desc' } });
    expect(last().params).not.toHaveProperty('search');
    expect(last().params).not.toHaveProperty('from');
    expect(r.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(r.items[0].id).toBe('a1');
  });

  it('does not send a 1-character search (the backend rejects it)', () => {
    expect(toAppointmentParams({ search: 'r' }).q).toBeUndefined();
    expect(toAppointmentParams({ search: '  ra ' }).q).toBe('ra');
  });

  it('"mine" uses GET /appointments (the backend pins doctors to their own) and never sends doctorId', async () => {
    reply = () => ({ data: [] });
    await appointmentsApi.mine({ doctorId: 'x', date: '2026-10-20' });
    expect(last()).toMatchObject({ method: 'GET', url: '/appointments', params: { date: '2026-10-20' } });
    expect(last().url).not.toMatch(/mine/);
    expect(last().params?.doctorId).toBeUndefined(); // undefined params are dropped by axios
  });

  it('arrive and complete are POSTs to their own routes (there is no PATCH /status)', async () => {
    await appointmentsApi.updateStatus('a1', 'ARRIVED');
    expect(last()).toMatchObject({ method: 'POST', url: '/appointments/a1/arrive' });
    await appointmentsApi.updateStatus('a1', 'COMPLETED');
    expect(last()).toMatchObject({ method: 'POST', url: '/appointments/a1/complete' });
  });

  it('cancels with POST /cancel and an optional reason', async () => {
    await appointmentsApi.cancel('a1', 'Patient request');
    expect(last()).toMatchObject({ method: 'POST', url: '/appointments/a1/cancel', body: { reason: 'Patient request' } });
    await appointmentsApi.cancel('a1');
    expect(last().body).toEqual({});
  });

  it('edits purpose/notes with PATCH and consultation notes with PATCH /consultation', async () => {
    await appointmentsApi.update('a1', { reason: 'New purpose', notes: 'n' });
    expect(last()).toMatchObject({ method: 'PATCH', url: '/appointments/a1', body: { purpose: 'New purpose', notes: 'n' } });
    await appointmentsApi.update('a1', { consultationNotes: 'Stable' });
    expect(last()).toMatchObject({ method: 'PATCH', url: '/appointments/a1/consultation', body: { consultationNotes: 'Stable' } });
  });

  it('builds slots from doctors/:id/slots (startTime/endTime + date) and treats a missing schedule as no slots', async () => {
    reply = () => ({ data: { doctorId: 'd1', date: '2026-10-20', slots: [{ startTime: '09:00', endTime: '09:15', status: 'AVAILABLE', available: true }, { startTime: '09:15', endTime: '09:30', status: 'BOOKED', available: false }] } });
    expect(await appointmentsApi.slots('d1', '2026-10-20')).toEqual([
      { start: '2026-10-20T09:00:00', end: '2026-10-20T09:15:00', status: 'AVAILABLE' },
      { start: '2026-10-20T09:15:00', end: '2026-10-20T09:30:00', status: 'BOOKED' },
    ]);
    expect(last()).toMatchObject({ method: 'GET', url: '/doctors/d1/slots', params: { date: '2026-10-20' } });
    reply = () => ({ status: 404 });
    expect(await appointmentsApi.slots('d1', '2026-10-20')).toEqual([]);
    expect(mapDaySlots(null, '2026-10-20')).toEqual([]);
  });

  it('round-trips wall-clock times without timezone conversion', () => {
    expect(splitWall(toWall('2026-12-31', '23:45'))).toEqual({ date: '2026-12-31', time: '23:45' });
  });
});

describe('patients, doctors, receptionists, departments', () => {
  it('searches patients with q and maps mobile/patientId; registers with mobile (separators stripped)', async () => {
    reply = () => ({ data: [{ _id: 'p1', patientId: 'PT-000001', name: 'Ravi', mobile: '9999900000', gender: 'MALE', dateOfBirth: '1990-05-01T00:00:00.000Z' }], meta: { page: 1, limit: 10, total: 1, pages: 1 } });
    const r = await patientsApi.search('ravi');
    expect(last()).toMatchObject({ method: 'GET', url: '/patients', params: { q: 'ravi', limit: 10 } });
    expect(r.items[0]).toMatchObject({ id: 'p1', patientCode: 'PT-000001', phone: '9999900000', dateOfBirth: '1990-05-01' });

    reply = () => ({ data: { _id: 'p2', patientId: 'PT-000002', name: 'New', mobile: '+919876543210' } });
    const p = await patientsApi.create({ name: 'New', phone: '+91 98765-43210', email: 'n@x.org', gender: 'FEMALE' });
    expect(last()).toMatchObject({ method: 'POST', url: '/patients', body: { name: 'New', mobile: '+919876543210', email: 'n@x.org', gender: 'FEMALE' } });
    expect(last().body).not.toHaveProperty('phone');
    expect(last().body).not.toHaveProperty('address');
    expect(p.phone).toBe('+919876543210');
  });

  it('creates a doctor with email+password; updates without email', async () => {
    reply = () => ({ data: { _id: 'd1', user: { _id: 'u', name: 'Dr A', email: 'a@x.org' }, department: { _id: 'dept1', name: 'Cardiology' }, specialization: 'Cardiology', isActive: true } });
    const d = await doctorsApi.create({ name: 'Dr A', email: 'a@x.org', password: 'Passw0rd12345', specialization: 'Cardiology', departmentId: 'dept1' });
    expect(last()).toMatchObject({ method: 'POST', url: '/doctors', body: { email: 'a@x.org', password: 'Passw0rd12345', departmentId: 'dept1' } });
    expect(last().body).not.toHaveProperty('phone');
    expect(d).toMatchObject({ id: 'd1', name: 'Dr A', email: 'a@x.org', departmentId: 'dept1', department: { id: 'dept1', name: 'Cardiology' } });

    await doctorsApi.update('d1', { name: 'Dr B', email: 'ignored@x.org', specialization: 'ENT', departmentId: 'dept2' });
    expect(last()).toMatchObject({ method: 'PATCH', url: '/doctors/d1', body: { name: 'Dr B', specialization: 'ENT', departmentId: 'dept2' } });
    expect(last().body).not.toHaveProperty('email');
  });

  it('lists doctors (lean docs use _id) and departments', async () => {
    reply = () => ({ data: [{ _id: 'd1', user: { name: 'Dr A', email: 'a@x.org' }, department: { _id: 'dept1', name: 'Cardiology' }, specialization: 'Cardiology' }], meta: { page: 1, limit: 100, total: 1, pages: 1 } });
    const r = await doctorsApi.list({ departmentId: 'dept1', limit: 100, search: 'a' });
    expect(last()).toMatchObject({ url: '/doctors', params: { departmentId: 'dept1', limit: 100, search: 'a' } });
    expect(r.items[0].id).toBe('d1');
    reply = () => ({ data: [{ _id: 'dept1', name: 'Cardiology' }] });
    expect((await departmentsApi.list()).items).toEqual([{ id: 'dept1', name: 'Cardiology', description: null }]);
  });

  it('creates a receptionist without a phone', async () => {
    reply = () => ({ data: { _id: 'r1', name: 'R', email: 'r@x.org', role: 'RECEPTIONIST', isActive: true } });
    const r = await receptionistsApi.create({ name: 'R', email: 'r@x.org', password: 'Passw0rd12345' });
    expect(last()).toMatchObject({ method: 'POST', url: '/receptionists', body: { name: 'R', email: 'r@x.org', password: 'Passw0rd12345' } });
    expect(r).toEqual({ id: 'r1', name: 'R', email: 'r@x.org', isActive: true });
  });
});

describe('schedules', () => {
  const stored = { _id: 's1', doctor: 'd1', timezone: 'Asia/Kolkata', workingDays: [5, 1, 3], sessions: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }], slotDuration: 15, breaks: [{ start: '12:00', end: '13:00' }], isActive: true };

  it('reads and writes the backend schedule shape (no per-day model, no `force`)', async () => {
    reply = () => ({ data: stored });
    const s = await schedulesApi.get('d1');
    expect(last()).toMatchObject({ method: 'GET', url: '/doctors/d1/schedule' });
    expect(s).toEqual({ timezone: 'Asia/Kolkata', isActive: true, slotDuration: 15, workingDays: [1, 3, 5], sessions: stored.sessions, breaks: stored.breaks });

    await schedulesApi.save('d1', s!);
    expect(last()).toMatchObject({ method: 'PUT', url: '/doctors/d1/schedule', body: { timezone: 'Asia/Kolkata', workingDays: [1, 3, 5], sessions: stored.sessions, breaks: stored.breaks, slotDuration: 15, isActive: true } });
    expect(Object.keys(last().body as object).sort()).toEqual(['breaks', 'isActive', 'sessions', 'slotDuration', 'timezone', 'workingDays']);
  });

  it('returns null only for 404', async () => {
    reply = () => ({ status: 404 });
    expect(await schedulesApi.get('d1')).toBeNull();
    reply = () => ({ status: 500 });
    await expect(schedulesApi.get('d1')).rejects.toBeTruthy();
  });
});

describe('auth and dashboard', () => {
  it('maps the login user (`_id`) and keeps the csrf token; logout sends X-CSRF-Token', async () => {
    reply = () => ({ data: { accessToken: 'a', tokenType: 'Bearer', expiresIn: 900, csrfToken: 'csrf-9', user: { _id: 'u1', name: 'N', email: 'n@x.org', role: 'RECEPTIONIST', isActive: true } } });
    const r = await authApi.login({ email: 'n@x.org', password: 'x' });
    expect(last()).toMatchObject({ method: 'POST', url: '/auth/login' });
    expect(r).toEqual({ accessToken: 'a', csrfToken: 'csrf-9', user: { id: 'u1', name: 'N', email: 'n@x.org', role: 'RECEPTIONIST', doctorId: null } });

    reply = () => ({ data: null });
    await authApi.logout();
    expect(last()).toMatchObject({ method: 'POST', url: '/auth/logout' });
    expect(last().headers['X-CSRF-Token']).toBe('csrf-1');
  });

  it('/auth/me supplies the doctor profile id', async () => {
    reply = () => ({ data: { user: { _id: 'u2', name: 'Dr A', email: 'a@x.org', role: 'DOCTOR' }, doctor: { _id: 'd1' } } });
    expect(await authApi.me()).toMatchObject({ id: 'u2', role: 'DOCTOR', doctorId: 'd1' });
  });

  it('adds a "today" total (non-cancelled) to the dashboard payload', async () => {
    reply = () => ({ data: { date: '2026-10-15', appointmentsByStatus: { SCHEDULED: 2, ARRIVED: 1, COMPLETED: 1, CANCELLED: 5 } } });
    expect(await dashboardApi.stats()).toMatchObject({ appointmentsToday: 4 });
    expect(last()).toMatchObject({ method: 'GET', url: '/dashboard/stats' });
  });
});
