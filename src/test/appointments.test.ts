import { availableActions, canRegisterPatients, editableFields } from '@/features/appointments/permissions';
import { pageInfo } from '@/features/appointments/paging';
import { normalizeStats } from '@/features/dashboard/stats';
import { keysToInvalidate } from '@/api/events';
import { mapDashboard } from '@/api/adapters';

const statuses = (role: Parameters<typeof availableActions>[0], s: Parameters<typeof availableActions>[1]) =>
  availableActions(role, s).map((a) => a.status);

describe('availableActions', () => {
  it('lets receptionists mark arrived or cancel, but not complete', () => {
    expect(statuses('RECEPTIONIST', 'SCHEDULED')).toEqual(['ARRIVED', 'CANCELLED']);
    expect(statuses('RECEPTIONIST', 'ARRIVED')).toEqual(['CANCELLED']);
  });
  it('lets doctors complete only arrived appointments', () => {
    expect(statuses('DOCTOR', 'ARRIVED')).toEqual(['COMPLETED']);
    expect(statuses('DOCTOR', 'SCHEDULED')).toEqual([]);
  });
  it('gives the super admin read-only access (the backend rejects their status changes)', () => {
    expect(statuses('SUPER_ADMIN', 'SCHEDULED')).toEqual([]);
    expect(statuses('SUPER_ADMIN', 'ARRIVED')).toEqual([]);
  });
  it('offers nothing on finished appointments or without a role', () => {
    expect(statuses('SUPER_ADMIN', 'COMPLETED')).toEqual([]);
    expect(statuses('SUPER_ADMIN', 'CANCELLED')).toEqual([]);
    expect(statuses(undefined, 'SCHEDULED')).toEqual([]);
  });
});

describe('editableFields / canRegisterPatients', () => {
  it('limits edits by role and status', () => {
    expect(editableFields('RECEPTIONIST', 'SCHEDULED')).toEqual(['reason', 'notes']);
    expect(editableFields('RECEPTIONIST', 'ARRIVED')).toEqual(['reason', 'notes']);
    expect(editableFields('RECEPTIONIST', 'COMPLETED')).toEqual([]); // backend: only SCHEDULED/ARRIVED are editable
    expect(editableFields('DOCTOR', 'ARRIVED')).toEqual(['consultationNotes']);
    expect(editableFields('DOCTOR', 'COMPLETED')).toEqual(['consultationNotes']);
    expect(editableFields('DOCTOR', 'SCHEDULED')).toEqual([]); // backend: notes need the patient to have arrived
    expect(editableFields('SUPER_ADMIN', 'SCHEDULED')).toEqual([]);
    expect(editableFields('RECEPTIONIST', 'CANCELLED')).toEqual([]);
  });
  it('restricts patient registration', () => {
    expect(canRegisterPatients('RECEPTIONIST')).toBe(true);
    expect(canRegisterPatients('DOCTOR')).toBe(false);
  });
});

describe('pageInfo', () => {
  it('uses server totals', () => {
    const p = pageInfo({ total: 25, totalPages: 3 }, 3, 10, 5);
    expect([p.from, p.to, p.hasPrev, p.hasNext]).toEqual([21, 25, true, false]);
  });
  it('derives totalPages from total, and falls back to page fullness', () => {
    expect(pageInfo({ total: 25 }, 1, 10, 10).totalPages).toBe(3);
    expect(pageInfo(undefined, 1, 10, 10).hasNext).toBe(true);
    expect(pageInfo(undefined, 1, 10, 4).hasNext).toBe(false);
  });
  it('handles an empty page', () => {
    const p = pageInfo({ total: 0, totalPages: 1 }, 1, 10, 0);
    expect([p.from, p.to, p.hasNext]).toEqual([0, 0, false]);
  });
});

describe('normalizeStats', () => {
  it('reads the backend admin payload (appointmentsByStatus + totals)', () => {
    const raw = mapDashboard({
      date: '2026-10-15',
      appointmentsByStatus: { SCHEDULED: 4, ARRIVED: 2, COMPLETED: 3, CANCELLED: 1 },
      totals: { activeDoctors: 6, activeReceptionists: 2, patients: 120, activeDepartments: 3 },
    });
    const r = normalizeStats(raw);
    expect(Object.fromEntries(r.known.map((m) => [m.id, m.value]))).toEqual({
      doctors: 6, receptionists: 2, patients: 120, today: 9, scheduled: 4, arrived: 2, completed: 3, cancelled: 1,
    });
  });

  it('maps a flat response', () => {
    const r = normalizeStats({ totalDoctors: 12, totalPatients: 300, todaysAppointments: 25, arrivedPatients: 3 });
    expect(r.known.map((m) => `${m.id}=${m.value}`)).toEqual(['doctors=12', 'patients=300', 'today=25', 'arrived=3']);
  });
  it('maps a nested response and keeps unknown numbers as extras', () => {
    const r = normalizeStats({ totals: { doctors: 5 }, appointments: { today: 9, byStatus: { SCHEDULED: 4, CANCELLED: 1 } }, overdueAppointments: 2 });
    expect(r.known.map((m) => m.id)).toEqual(['doctors', 'today', 'scheduled', 'cancelled']);
    expect(r.extras.map((m) => m.label)).toEqual(['Overdue appointments']);
  });
  it('reports empty for non-numeric payloads', () => {
    expect(normalizeStats({}).isEmpty).toBe(true);
    expect(normalizeStats(null).isEmpty).toBe(true);
  });
});

describe('keysToInvalidate', () => {
  it('invalidates lists, detail, dashboard and slots for appointment events', () => {
    for (const e of ['appointment:created', 'appointment:updated', 'appointment:cancelled', 'appointment:status-changed']) {
      expect(keysToInvalidate(e)).toEqual([['appointments'], ['appointment'], ['dashboard'], ['slots']]);
    }
  });
  it('narrows slot caches to the doctor in the payload', () => {
    expect(keysToInvalidate('slot:updated', { doctorId: 'd1' })).toEqual([['slots', 'd1']]);
    expect(keysToInvalidate('appointment:created', { doctorId: 'd1' }).at(-1)).toEqual(['slots', 'd1']);
    expect(keysToInvalidate('slot:updated')).toEqual([['slots']]);
  });
  it('ignores unknown events', () => {
    expect(keysToInvalidate('something:else')).toEqual([]);
  });
});
