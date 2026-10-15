/**
 * The single place where the backend's wire format is translated to the shapes the UI works with
 * (and back). Keeping this in one file means a contract change is a one-file change, and every
 * field-name difference is documented here instead of being scattered through components.
 *
 *   backend                                   UI
 *   -------                                   --
 *   _id                                       id
 *   appointmentDate + startTime/endTime       scheduledAt / endsAt  (wall-clock "YYYY-MM-DDTHH:mm:00")
 *   purpose                                   reason
 *   patient.patientId / patient.mobile        patient.patientCode / patient.phone
 *   doctor.user.{name,email}                  doctor.{name,email}
 *   meta.pages                                meta.totalPages
 *
 * Appointment times are wall-clock values in the doctor's schedule timezone. They are carried as
 * timezone-less strings and are never converted through UTC, so the screen always shows exactly what
 * the backend stored, whatever the browser's timezone is.
 */
import type {
  Appointment, AppointmentStatus, AuthUser, Department, Doctor, DoctorSchedule, Patient, Receptionist, Slot, TimeRange,
} from '@/types';

export type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
export const idOf = (v: unknown): string => (typeof v === 'string' ? v : isObj(v) ? String(v._id ?? v.id ?? '') : '');

/** `YYYY-MM-DD` + `HH:mm` -> `YYYY-MM-DDTHH:mm:00` (no timezone designator on purpose). */
export const toWall = (date: string, time: string): string => `${date}T${time}:00`;
/** Inverse of `toWall`, by string slicing (no Date round-trip). */
export const splitWall = (wall: string): { date: string; time: string } => ({ date: wall.slice(0, 10), time: wall.slice(11, 16) });

/** Backend validation paths -> the field names the UI forms use. */
export const UI_FIELD_ALIASES: Record<string, string> = {
  mobile: 'phone',
  purpose: 'reason',
  appointmentDate: 'scheduledAt',
  startTime: 'scheduledAt',
  q: 'search',
};

export const mapDepartment = (r: Raw): Department => ({
  id: idOf(r),
  name: r.name ?? '',
  description: r.description ?? null,
});

export function mapDoctor(r: Raw): Doctor {
  const user = isObj(r.user) ? r.user : {};
  const dept = isObj(r.department) ? mapDepartment(r.department) : null;
  return {
    id: idOf(r),
    name: user.name ?? r.name ?? '',
    email: user.email ?? r.email ?? '',
    specialization: r.specialization ?? '',
    room: r.room ?? null,
    departmentId: idOf(r.department) || null,
    department: dept,
    isActive: r.isActive,
    createdAt: r.createdAt,
  };
}

export const mapReceptionist = (r: Raw): Receptionist => ({
  id: idOf(r),
  name: r.name ?? '',
  email: r.email ?? '',
  isActive: r.isActive,
});

export const mapPatient = (r: Raw): Patient => ({
  id: idOf(r),
  patientCode: r.patientId ?? null,
  name: r.name ?? '',
  phone: r.mobile ?? null,
  email: r.email ?? null,
  dateOfBirth: r.dateOfBirth ? String(r.dateOfBirth).slice(0, 10) : null,
  gender: r.gender ?? null,
});

export function mapAppointment(r: Raw): Appointment {
  const doctor = isObj(r.doctor) ? mapDoctor(r.doctor) : null;
  return {
    id: idOf(r),
    patientId: idOf(r.patient),
    doctorId: idOf(r.doctor),
    patient: isObj(r.patient) ? mapPatient(r.patient) : undefined,
    doctor: doctor ? { id: doctor.id, name: doctor.name, specialization: doctor.specialization } : undefined,
    department: isObj(r.department) ? { id: idOf(r.department), name: r.department.name ?? '' } : undefined,
    scheduledAt: toWall(r.appointmentDate, r.startTime),
    endsAt: r.endTime ? toWall(r.appointmentDate, r.endTime) : undefined,
    reason: r.purpose ?? null,
    notes: r.notes ?? null,
    consultationNotes: r.consultationNotes ?? null,
    cancelReason: r.cancelReason ?? null,
    status: r.status as AppointmentStatus,
    updatedAt: r.updatedAt,
  };
}

/** Auth payloads carry a raw user document (`_id`, no `doctorId`). */
export const mapAuthUser = (r: Raw): AuthUser => ({
  id: idOf(r),
  name: r.name ?? '',
  email: r.email ?? '',
  role: r.role,
  doctorId: null,
});

const mapRange = (t: Raw): TimeRange => ({ start: t.start, end: t.end });

export const mapSchedule = (r: Raw): DoctorSchedule => ({
  timezone: r.timezone,
  isActive: !!r.isActive,
  slotDuration: r.slotDuration,
  workingDays: [...(r.workingDays ?? [])].sort((a: number, b: number) => a - b),
  sessions: (r.sessions ?? []).map(mapRange),
  breaks: (r.breaks ?? []).map(mapRange),
});

/** `GET /doctors/:id/slots` -> `{ slots: [{ startTime, endTime, status }] }` for one doctor/day. */
export function mapDaySlots(data: unknown, date: string): Slot[] {
  const day = Array.isArray(data) ? data[0] : data;
  const slots: Raw[] = isObj(day) && Array.isArray(day.slots) ? day.slots : [];
  return slots.map((s) => ({
    start: toWall(date, s.startTime),
    end: toWall(date, s.endTime),
    status: s.status === 'BOOKED' ? 'BOOKED' : 'AVAILABLE',
  }));
}

/** Backend phone numbers are digits with an optional leading '+'; strip the separators people type. */
export const normalizeMobile = (v: string): string => v.replace(/[\s\-().]/g, '');

/**
 * `GET /dashboard/stats` has no "today" total, only per-status counts for the day. Add the sum of the
 * non-cancelled ones so the existing metric matcher can show it.
 */
export function mapDashboard(raw: unknown): unknown {
  if (!isObj(raw) || !isObj(raw.appointmentsByStatus)) return raw;
  const total = Object.entries(raw.appointmentsByStatus).reduce<number>(
    (n, [status, v]) => (status !== 'CANCELLED' && typeof v === 'number' ? n + v : n),
    0,
  );
  return { ...raw, appointmentsToday: total };
}
