import axios from 'axios';
import { api, ensureCsrfToken, unwrap } from './client';
import {
  mapAppointment, mapAuthUser, mapDaySlots, mapDashboard, mapDepartment, mapDoctor, mapPatient, mapReceptionist,
  mapSchedule, normalizeMobile, splitWall, idOf, type Raw,
} from './adapters';
import type {
  ApiEnvelope, Appointment, AppointmentStatus, AuthUser, Department, DoctorSchedule, Paginated, Patient,
  Receptionist, Slot,
} from '@/types';

/** Fetch a list endpoint whose envelope is `{ data: T[], meta }` and map each row. */
async function list<T>(
  url: string,
  params: Record<string, unknown> | undefined,
  signal: AbortSignal | undefined,
  map: (r: Raw) => T,
): Promise<Paginated<T>> {
  const res = await api.get<ApiEnvelope<Raw[]>>(url, { params, signal });
  const m = (res.data.meta ?? {}) as Raw;
  return {
    items: (res.data.data ?? []).map(map),
    // The backend names the page count `pages`.
    meta: { page: m.page, limit: m.limit, total: m.total, totalPages: m.totalPages ?? m.pages },
  };
}

// ---------- auth ----------
export interface LoginInput {
  email: string;
  password: string;
}
export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  /** Double-submit token the backend requires on /auth/refresh and /auth/logout. */
  csrfToken?: string;
}

export const authApi = {
  login: async (input: LoginInput): Promise<LoginResult> => {
    const d = await unwrap<Raw>(api.post('/auth/login', input));
    return { user: mapAuthUser(d.user), accessToken: d.accessToken, csrfToken: d.csrfToken };
  },
  logout: async () => {
    const token = await ensureCsrfToken();
    return unwrap<null>(api.post('/auth/logout', undefined, { headers: { 'X-CSRF-Token': token } }));
  },
  /** `/auth/me` returns `{ user, doctor }`; the doctor profile id is what the UI calls `doctorId`. */
  me: async (): Promise<AuthUser> => {
    const d = await unwrap<{ user: Raw; doctor?: Raw | null }>(api.get('/auth/me'));
    return { ...mapAuthUser(d.user), doctorId: d.doctor ? idOf(d.doctor) : null };
  },
};

// ---------- dashboard ----------
export const dashboardApi = {
  /** Payload from GET /dashboard/stats (role-aware); its shape is interpreted by features/dashboard/stats.ts. */
  stats: async () => mapDashboard(await unwrap<unknown>(api.get('/dashboard/stats'))),
};

// ---------- doctors ----------
export interface DoctorInput {
  name: string;
  /** Create only: the backend does not allow changing a doctor's email. */
  email?: string;
  specialization: string;
  departmentId: string;
  room?: string;
  /** Required on create (min 12 chars, letter + digit); optional admin reset on update. */
  password?: string;
}
export interface DoctorQuery {
  search?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export const doctorsApi = {
  list: (q: DoctorQuery = {}, signal?: AbortSignal) => list('/doctors', q as Record<string, unknown>, signal, mapDoctor),
  get: async (id: string) => mapDoctor(await unwrap<Raw>(api.get(`/doctors/${id}`))),
  create: async (input: DoctorInput) => mapDoctor(await unwrap<Raw>(api.post('/doctors', input))),
  update: async (id: string, input: Partial<DoctorInput>) => {
    const { email: _email, ...body } = input; // PATCH /doctors/:id is strict: email is not updatable
    void _email;
    return mapDoctor(await unwrap<Raw>(api.patch(`/doctors/${id}`, body)));
  },
};

// ---------- receptionists ----------
export interface ReceptionistInput {
  name: string;
  email: string;
  password: string;
}

export const receptionistsApi = {
  list: (q: { search?: string } = {}, signal?: AbortSignal) => list('/receptionists', q, signal, mapReceptionist),
  create: async (input: ReceptionistInput): Promise<Receptionist> =>
    mapReceptionist(await unwrap<Raw>(api.post('/receptionists', input))),
};

// ---------- doctor schedules ----------
export const schedulesApi = {
  /** Resolves `null` only when the backend answers 404 (no schedule configured yet). */
  get: async (doctorId: string, signal?: AbortSignal): Promise<DoctorSchedule | null> => {
    try {
      return mapSchedule(await unwrap<Raw>(api.get(`/doctors/${doctorId}/schedule`, { signal })));
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) return null;
      throw e;
    }
  },
  /**
   * Create/replace. The backend answers 409 SCHEDULE_CONFLICT (with the affected appointments) when the
   * change would orphan upcoming bookings; there is no override, those must be rescheduled or cancelled first.
   */
  save: async (doctorId: string, s: DoctorSchedule) =>
    mapSchedule(
      await unwrap<Raw>(
        api.put(`/doctors/${doctorId}/schedule`, {
          timezone: s.timezone,
          workingDays: s.workingDays,
          sessions: s.sessions,
          breaks: s.breaks,
          slotDuration: s.slotDuration,
          isActive: s.isActive,
        }),
      ),
    ),
};

// ---------- departments ----------
export const departmentsApi = {
  list: (signal?: AbortSignal) => list<Department>('/departments', undefined, signal, mapDepartment),
  create: async (input: { name: string; description?: string }) =>
    mapDepartment(await unwrap<Raw>(api.post('/departments', input))),
};

// ---------- patients ----------
export interface PatientInput {
  name: string;
  /** Sent as `mobile`; separators are stripped. */
  phone: string;
  email?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
}

export const patientsApi = {
  /** Backend `q` matches patient ID, name or mobile (min 2 characters). */
  search: (search: string, signal?: AbortSignal) => list('/patients', { q: search, limit: 10 }, signal, mapPatient),
  create: async (input: PatientInput): Promise<Patient> => {
    const { phone, ...rest } = input;
    return mapPatient(await unwrap<Raw>(api.post('/patients', { ...rest, mobile: normalizeMobile(phone) })));
  },
};

// ---------- appointments ----------
/** Sortable columns. `scheduledAt` maps to the backend's `appointmentDate` (+ `startTime` tie-break). */
export type AppointmentSortKey = 'scheduledAt' | 'status';

const SORT_FIELD: Record<AppointmentSortKey, string> = { scheduledAt: 'appointmentDate', status: 'status' };
/** The backend rejects free-text searches shorter than this. */
export const MIN_SEARCH_CHARS = 2;

export interface AppointmentQuery {
  date?: string; // YYYY-MM-DD (single day)
  from?: string; // YYYY-MM-DD (range start, inclusive)  -> dateFrom
  to?: string; // YYYY-MM-DD (range end, inclusive)    -> dateTo
  status?: AppointmentStatus;
  /** Free text matched server-side against patient name, patient ID and mobile (`q`). */
  search?: string;
  departmentId?: string;
  doctorId?: string;
  page?: number;
  limit?: number;
  sortBy?: AppointmentSortKey;
  sortOrder?: 'asc' | 'desc';
}
export interface AppointmentEditInput {
  /** Visit purpose (backend `purpose`). Receptionist only. */
  reason?: string;
  /** General notes. Receptionist only. */
  notes?: string;
  /** Clinical notes. Assigned doctor only, once the patient has arrived. */
  consultationNotes?: string;
}
export interface BookAppointmentInput {
  patientId: string;
  doctorId: string;
  /** Wall-clock slot start from the slot grid (`YYYY-MM-DDTHH:mm:00`). */
  scheduledAt: string;
  reason: string;
  notes?: string;
}

export function toAppointmentParams(q: AppointmentQuery): Record<string, unknown> {
  const search = q.search?.trim();
  return {
    date: q.date,
    dateFrom: q.from,
    dateTo: q.to,
    status: q.status,
    q: search && search.length >= MIN_SEARCH_CHARS ? search : undefined,
    departmentId: q.departmentId,
    doctorId: q.doctorId,
    page: q.page,
    limit: q.limit,
    sortBy: q.sortBy ? SORT_FIELD[q.sortBy] : undefined,
    sortOrder: q.sortOrder,
  };
}

export const appointmentsApi = {
  list: (q: AppointmentQuery = {}, signal?: AbortSignal) =>
    list('/appointments', toAppointmentParams(q), signal, mapAppointment),
  /** Doctors are always scoped to their own appointments by the backend, so this is the same endpoint. */
  mine: (q: AppointmentQuery = {}, signal?: AbortSignal) =>
    list('/appointments', toAppointmentParams({ ...q, doctorId: undefined }), signal, mapAppointment),
  get: async (id: string, signal?: AbortSignal) => mapAppointment(await unwrap<Raw>(api.get(`/appointments/${id}`, { signal }))),
  book: async (input: BookAppointmentInput) => {
    const { date, time } = splitWall(input.scheduledAt);
    return mapAppointment(
      await unwrap<Raw>(
        api.post('/appointments', {
          patientId: input.patientId,
          doctorId: input.doctorId,
          appointmentDate: date,
          startTime: time,
          purpose: input.reason,
          ...(input.notes ? { notes: input.notes } : {}),
        }),
      ),
    );
  },
  /**
   * Edit permitted fields. Purpose/notes go to PATCH /appointments/:id (receptionist); consultation notes
   * go to PATCH /appointments/:id/consultation (assigned doctor). The backend enforces who may do which.
   */
  update: async (id: string, input: AppointmentEditInput): Promise<Appointment> => {
    const { consultationNotes, reason, notes } = input;
    let result: Raw | null = null;
    if (reason !== undefined || notes !== undefined) {
      result = await unwrap<Raw>(
        api.patch(`/appointments/${id}`, { ...(reason !== undefined ? { purpose: reason } : {}), ...(notes !== undefined ? { notes } : {}) }),
      );
    }
    if (consultationNotes !== undefined) {
      result = await unwrap<Raw>(api.patch(`/appointments/${id}/consultation`, { consultationNotes }));
    }
    return mapAppointment(result ?? (await unwrap<Raw>(api.get(`/appointments/${id}`))));
  },
  /** Forward moves only: SCHEDULED -> ARRIVED (`/arrive`) and ARRIVED -> COMPLETED (`/complete`). */
  updateStatus: async (id: string, status: Exclude<AppointmentStatus, 'CANCELLED' | 'SCHEDULED'>) =>
    mapAppointment(
      await unwrap<Raw>(status === 'ARRIVED' ? api.post(`/appointments/${id}/arrive`) : api.post(`/appointments/${id}/complete`, {})),
    ),
  /** Logical cancellation: the record is kept and its status becomes CANCELLED. A reason is required once ARRIVED. */
  cancel: async (id: string, reason?: string) =>
    mapAppointment(await unwrap<Raw>(api.post(`/appointments/${id}/cancel`, reason ? { reason } : {}))),
  /** Slots for a doctor/date, with the backend as the source of truth for availability. No schedule -> no slots. */
  slots: async (doctorId: string, date: string, signal?: AbortSignal): Promise<Slot[]> => {
    try {
      return mapDaySlots(await unwrap<unknown>(api.get(`/doctors/${doctorId}/slots`, { params: { date }, signal })), date);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) return [];
      throw e;
    }
  },
};

