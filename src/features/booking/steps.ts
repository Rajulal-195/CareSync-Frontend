import type { Doctor, Patient } from '@/types';

/** All wizard form state lives in one object so it survives moving between steps. */
export interface BookingDraft {
  departmentId: string;
  doctor: Doctor | null;
  date: string; // YYYY-MM-DD
  slot: string; // ISO start of the chosen slot
  patient: Patient | null;
  reason: string;
}

export const STEP_LABELS = ['Doctor', 'Date & time', 'Patient', 'Purpose', 'Confirm'] as const;
export const LAST_STEP = STEP_LABELS.length - 1;

export const emptyDraft = (today: string): BookingDraft => ({
  departmentId: '',
  doctor: null,
  date: today,
  slot: '',
  patient: null,
  reason: '',
});

/** Returns an error message when the step is incomplete, otherwise null. Step 4 has no input of its own. */
export function validateStep(step: number, d: BookingDraft): string | null {
  switch (step) {
    case 0:
      if (!d.departmentId) return 'Select a department.';
      if (!d.doctor) return 'Select a doctor.';
      return null;
    case 1:
      if (!d.date) return 'Select a date.';
      if (!d.slot) return 'Select an available time slot.';
      return null;
    case 2:
      return d.patient ? null : 'Select an existing patient or register a new one.';
    case 3:
      return d.reason.trim().length >= 3 ? null : 'Enter the purpose of the visit (at least 3 characters).';
    default:
      return null;
  }
}

/** First step (0–3) that is still invalid, or -1 when the draft is complete. */
export function firstInvalidStep(d: BookingDraft): number {
  for (let s = 0; s <= 3; s++) if (validateStep(s, d)) return s;
  return -1;
}

/** Where to open the wizard given what was pre-filled (e.g. from the scheduler). */
export function startStepFor(d: BookingDraft): number {
  const bad = firstInvalidStep(d);
  return bad === -1 ? 3 : bad;
}
