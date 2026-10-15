import { toWall } from '@/api/adapters';
import type { DoctorSchedule, ScheduleConflict, TimeRange } from '@/types';

/** Pure, dependency-free schedule validation so it is easy to unit test. */
export interface Issue {
  /** react-hook-form style path, e.g. `days.1.sessions.0.end`; group-level issues end in `.root`. */
  path: string;
  message: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function checkRange(r: TimeRange, path: string, label: string, issues: Issue[]): boolean {
  let ok = true;
  if (!TIME_RE.test(r.start ?? '')) { issues.push({ path: `${path}.start`, message: `Enter a ${label} start time` }); ok = false; }
  if (!TIME_RE.test(r.end ?? '')) { issues.push({ path: `${path}.end`, message: `Enter a ${label} end time` }); ok = false; }
  if (ok && toMinutes(r.end) <= toMinutes(r.start)) {
    issues.push({ path: `${path}.end`, message: 'End time must be after start time' });
    ok = false;
  }
  return ok;
}

/** Flags every range that starts before the latest end seen so far (catches nested and chained overlaps). */
function flagOverlaps(items: { r: TimeRange; i: number }[], pathFor: (i: number) => string, message: string, issues: Issue[]) {
  const sorted = [...items].sort((a, b) => toMinutes(a.r.start) - toMinutes(b.r.start));
  let maxEnd = -1;
  for (const cur of sorted) {
    if (maxEnd >= 0 && toMinutes(cur.r.start) < maxEnd) issues.push({ path: pathFor(cur.i), message });
    maxEnd = Math.max(maxEnd, toMinutes(cur.r.end));
  }
}

export function validateSchedule(v: DoctorSchedule): Issue[] {
  const issues: Issue[] = [];

  if (!v.timezone || !isValidTimezone(v.timezone)) issues.push({ path: 'timezone', message: 'Select a valid timezone' });

  const dur = v.slotDuration;
  const durOk = Number.isInteger(dur) && dur >= 5 && dur <= 240;
  if (!durOk) issues.push({ path: 'slotDuration', message: 'Slot duration must be a whole number between 5 and 240 minutes' });

  if (v.workingDays.length === 0) issues.push({ path: 'workingDays', message: 'Select at least one working day.' });

  if (v.sessions.length === 0) issues.push({ path: 'sessions.root', message: 'Add at least one session' });
  if (v.sessions.length > 6) issues.push({ path: 'sessions.root', message: 'At most 6 sessions are allowed' });

  const valid: { r: TimeRange; i: number }[] = [];
  v.sessions.forEach((s, si) => {
    if (!checkRange(s, `sessions.${si}`, 'session', issues)) return;
    valid.push({ r: s, i: si });
  });
  flagOverlaps(valid, (i) => `sessions.${i}.start`, 'Overlaps another session', issues);
  // Same rule as the backend: at least one session must be long enough for a single slot.
  if (durOk && valid.length > 0 && !valid.some((s) => toMinutes(s.r.end) - toMinutes(s.r.start) >= dur)) {
    issues.push({ path: 'slotDuration', message: `The ${dur}-minute slot does not fit in any session` });
  }

  if (v.breaks.length > 10) issues.push({ path: 'breaks.root', message: 'At most 10 breaks are allowed' });
  const validBreaks: { r: TimeRange; i: number }[] = [];
  v.breaks.forEach((b, bi) => {
    if (!checkRange(b, `breaks.${bi}`, 'break', issues)) return;
    validBreaks.push({ r: b, i: bi });
    const inside = valid.some((s) => toMinutes(b.start) >= toMinutes(s.r.start) && toMinutes(b.end) <= toMinutes(s.r.end));
    if (!inside) issues.push({ path: `breaks.${bi}.start`, message: 'Break must fall within a single session' });
  });
  flagOverlaps(validBreaks, (i) => `breaks.${i}.start`, 'Overlaps another break', issues);

  return issues;
}

/** Display order: Monday first. Values are `dayOfWeek` (0 = Sunday). */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Editable starting point for a doctor with no saved schedule. Not saved until the user saves. */
export function newScheduleDraft(timezone: string): DoctorSchedule {
  return {
    timezone,
    isActive: true,
    slotDuration: 15,
    workingDays: [1, 2, 3, 4, 5],
    sessions: [{ start: '09:00', end: '17:00' }],
    breaks: [],
  };
}

/** Builds form state from a stored schedule. */
export function normalizeSchedule(s: DoctorSchedule): DoctorSchedule {
  return {
    timezone: s.timezone,
    isActive: !!s.isActive,
    slotDuration: s.slotDuration,
    workingDays: [...s.workingDays],
    sessions: s.sessions.map((t) => ({ ...t })),
    breaks: s.breaks.map((t) => ({ ...t })),
  };
}

/**
 * Pulls the affected appointments out of a 409 SCHEDULE_CONFLICT payload
 * (`{ count, appointments: [{ id, appointmentDate, startTime, endTime, status, reason }] }`).
 */
export function extractConflicts(data: unknown): ScheduleConflict[] {
  const arr = (data as { appointments?: unknown } | undefined)?.appointments;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c): c is Record<string, string> => !!c && typeof c.appointmentDate === 'string' && typeof c.startTime === 'string')
    .map((c) => ({
      appointmentId: c.id,
      scheduledAt: toWall(c.appointmentDate, c.startTime),
      status: c.status as ScheduleConflict['status'],
      reason: c.reason,
    }));
}
