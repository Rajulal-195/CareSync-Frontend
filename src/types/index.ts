export type Role = 'SUPER_ADMIN' | 'RECEPTIONIST' | 'DOCTOR';

export type AppointmentStatus = 'SCHEDULED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';

/** Backend response envelope. */
export interface ApiEnvelope<T, M = Record<string, unknown>> {
  success: boolean;
  message: string;
  data: T;
  meta?: M;
}

export interface PageMeta {
  page?: number;
  limit?: number;
  total?: number;
  /** Backend sends this as `pages`; the API layer maps it. */
  totalPages?: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  doctorId?: string | null;
}

export interface Department {
  id: string;
  name: string;
  description?: string | null;
}

export interface Doctor {
  id: string;
  name: string;
  email: string;
  specialization: string;
  room?: string | null;
  departmentId?: string | null;
  department?: Department | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface Receptionist {
  id: string;
  name: string;
  email: string;
  isActive?: boolean;
}

export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'UNAVAILABLE';

/**
 * Backend-authoritative slot. `start`/`end` are wall-clock `YYYY-MM-DDTHH:mm:00` strings in the doctor's
 * schedule timezone (built from the backend's `date` + `startTime`/`endTime`; never converted through UTC).
 */
export interface Slot {
  start: string;
  end?: string;
  status: SlotStatus;
}

/** "HH:mm" 24-hour times in the schedule's timezone. */
export interface TimeRange {
  start: string;
  end: string;
}

/** Mirrors the backend schedule: sessions and breaks apply to every working day. */
export interface DoctorSchedule {
  timezone: string;
  isActive: boolean;
  /** minutes, 5-240 */
  slotDuration: number;
  /** 0 = Sunday … 6 = Saturday */
  workingDays: number[];
  sessions: TimeRange[];
  breaks: TimeRange[];
}

/** An upcoming appointment that a schedule change would invalidate (409 SCHEDULE_CONFLICT). */
export interface ScheduleConflict {
  appointmentId?: string;
  /** wall-clock `YYYY-MM-DDTHH:mm:00` */
  scheduledAt: string;
  status?: AppointmentStatus;
  reason?: string;
}

export interface Patient {
  id: string;
  /** Human-facing patient ID (backend `patientId`, e.g. PT-000001). */
  patientCode?: string | null;
  name: string;
  /** Backend field `mobile`. */
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  patient?: Patient;
  doctor?: Pick<Doctor, 'id' | 'name' | 'specialization'>;
  department?: Pick<Department, 'id' | 'name'>;
  /** Wall-clock `YYYY-MM-DDTHH:mm:00` = backend `appointmentDate` + `startTime`. */
  scheduledAt: string;
  /** Wall-clock end = backend `appointmentDate` + `endTime`. */
  endsAt?: string;
  /** Backend `purpose`. */
  reason?: string | null;
  notes?: string | null;
  /** Doctor-only clinical notes. Not returned by list endpoints. */
  consultationNotes?: string | null;
  cancelReason?: string | null;
  status: AppointmentStatus;
  updatedAt?: string;
}

export interface ApiErrorShape {
  status?: number;
  /** Backend error code, e.g. VALIDATION_ERROR, SCHEDULE_CONFLICT, INVALID_TRANSITION. */
  code?: string;
  message: string;
  fieldErrors?: Record<string, string>;
  /** Non-field `error.details` from the backend (e.g. the affected appointments on SCHEDULE_CONFLICT). */
  data?: unknown;
}
