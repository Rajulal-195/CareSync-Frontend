import { extractConflicts, newScheduleDraft, validateSchedule } from '@/features/schedules/validation';
import { emptyDraft, firstInvalidStep, startStepFor, validateStep } from '@/features/booking/steps';

const draft = () => newScheduleDraft('Asia/Kolkata');
const paths = (s: ReturnType<typeof draft>) => validateSchedule(s).map((i) => i.path);

describe('validateSchedule', () => {
  it('accepts the default draft', () => expect(validateSchedule(draft())).toEqual([]));

  it('rejects end before start', () => {
    const s = draft();
    s.sessions[0] = { start: '12:00', end: '09:00' };
    expect(paths(s)).toContain('sessions.0.end');
  });

  it('flags nested and chained session overlaps but allows touching sessions', () => {
    const s = draft();
    s.sessions = [{ start: '09:00', end: '17:00' }, { start: '10:00', end: '11:00' }, { start: '12:00', end: '13:00' }];
    expect(paths(s)).toEqual(expect.arrayContaining(['sessions.1.start', 'sessions.2.start']));
    s.sessions = [{ start: '09:00', end: '12:00' }, { start: '12:00', end: '15:00' }];
    expect(validateSchedule(s)).toEqual([]);
  });

  it('requires breaks to sit inside a session and not overlap', () => {
    const s = draft();
    s.breaks = [{ start: '17:30', end: '18:00' }, { start: '12:00', end: '13:00' }, { start: '12:30', end: '13:30' }];
    expect(paths(s)).toEqual(expect.arrayContaining(['breaks.0.start', 'breaks.2.start']));
  });

  it('mirrors the backend: a slot must fit in at least one session; duration 5-240; valid timezone', () => {
    const s = draft();
    s.slotDuration = 60;
    s.sessions = [{ start: '09:00', end: '09:30' }];
    expect(paths(s)).toContain('slotDuration');
    s.sessions = [{ start: '09:00', end: '09:30' }, { start: '10:00', end: '12:00' }];
    expect(validateSchedule(s)).toEqual([]); // one long-enough session is enough
    s.slotDuration = 3;
    s.timezone = 'Mars/Olympus';
    expect(paths(s)).toEqual(expect.arrayContaining(['slotDuration', 'timezone']));
  });

  it('requires at least one working day and one session', () => {
    const s = draft();
    s.workingDays = [];
    s.sessions = [];
    expect(paths(s)).toEqual(expect.arrayContaining(['workingDays', 'sessions.root']));
  });
});

describe('extractConflicts', () => {
  it('reads the SCHEDULE_CONFLICT payload and ignores junk', () => {
    const out = extractConflicts({
      count: 2,
      appointments: [
        { id: 'a1', appointmentDate: '2026-10-20', startTime: '10:00', endTime: '10:15', status: 'SCHEDULED', reason: 'no longer matches a generated slot' },
        { nope: 1 },
      ],
    });
    expect(out).toEqual([{ appointmentId: 'a1', scheduledAt: '2026-10-20T10:00:00', status: 'SCHEDULED', reason: 'no longer matches a generated slot' }]);
    expect(extractConflicts(undefined)).toEqual([]);
    expect(extractConflicts({ appointments: 'x' })).toEqual([]);
  });
});

describe('booking steps', () => {
  const full = () => ({
    ...emptyDraft('2026-10-14'),
    departmentId: 'd1',
    doctor: { id: 'doc1', name: 'A', email: 'a@x.org', specialization: 'Cardio' },
    slot: '2026-10-14T10:00:00',
    patient: { id: 'p1', name: 'P' },
    reason: 'Checkup',
  });

  it('validates each step', () => {
    const d = emptyDraft('2026-10-14');
    expect(validateStep(0, d)).toMatch(/department/i);
    expect(validateStep(1, d)).toMatch(/slot/i);
    expect(validateStep(2, d)).toMatch(/patient/i);
    expect(validateStep(3, d)).toMatch(/purpose/i);
    expect(firstInvalidStep(full())).toBe(-1);
  });

  it('opens at the first incomplete step', () => {
    expect(startStepFor(emptyDraft('2026-10-14'))).toBe(0);
    expect(startStepFor({ ...full(), patient: null, reason: '' })).toBe(2);
    expect(startStepFor({ ...full(), reason: '' })).toBe(3);
  });
});
