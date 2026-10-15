import type { AppointmentStatus, Role } from '@/types';

/** UX hints only. The backend validates every transition and field edit. */
export interface StatusAction {
  status: AppointmentStatus;
  label: string;
}

/** Valid forward moves from each status (SCHEDULED → ARRIVED → COMPLETED; CANCELLED from the first two). */
export const NEXT_ACTIONS: Record<AppointmentStatus, StatusAction[]> = {
  SCHEDULED: [
    { status: 'ARRIVED', label: 'Mark arrived' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  ARRIVED: [
    { status: 'COMPLETED', label: 'Complete' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Which target statuses a role may request. Mirrors the backend: arrive and cancel are receptionist-only,
 * complete is for the assigned doctor (or a receptionist). The super admin has read-only access.
 */
export const ROLE_STATUS_TARGETS: Record<Role, AppointmentStatus[]> = {
  SUPER_ADMIN: [],
  RECEPTIONIST: ['ARRIVED', 'CANCELLED'],
  DOCTOR: ['COMPLETED'],
};

export function availableActions(role: Role | undefined, status: AppointmentStatus): StatusAction[] {
  if (!role) return [];
  const allowed = ROLE_STATUS_TARGETS[role];
  return NEXT_ACTIONS[status].filter((a) => allowed.includes(a.status));
}

export type EditableField = 'reason' | 'notes' | 'consultationNotes';

/**
 * Fields the role may edit at the current status (the backend enforces the same rules):
 * - receptionist: purpose and notes while SCHEDULED or ARRIVED;
 * - doctor: consultation notes once the patient has arrived (ARRIVED or COMPLETED);
 * - super admin: read-only.
 */
export function editableFields(role: Role | undefined, status: AppointmentStatus): EditableField[] {
  if (role === 'RECEPTIONIST' && (status === 'SCHEDULED' || status === 'ARRIVED')) return ['reason', 'notes'];
  if (role === 'DOCTOR' && (status === 'ARRIVED' || status === 'COMPLETED')) return ['consultationNotes'];
  return [];
}

export const CAN_REGISTER_PATIENTS: Role[] = ['SUPER_ADMIN', 'RECEPTIONIST'];
export const canRegisterPatients = (role: Role | undefined): boolean => !!role && CAN_REGISTER_PATIENTS.includes(role);
