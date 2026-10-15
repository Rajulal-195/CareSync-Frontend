import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import clsx from 'clsx';
import { Check, CheckCircle2, UserPlus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { DatePicker } from '@/components/ui/DatePicker';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PatientSearch } from '@/features/patients/PatientSearch';
import { PatientFormModal } from '@/features/patients/PatientFormModal';
import { DoctorSelector } from '@/features/scheduler/DoctorSelector';
import { SlotGrid } from '@/features/scheduler/SlotGrid';
import { emptyDraft, firstInvalidStep, LAST_STEP, startStepFor, STEP_LABELS, validateStep, type BookingDraft } from '@/features/booking/steps';
import { toApiError } from '@/api/client';
import { formatDate, formatTime, todayISO } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useBookAppointment } from './hooks';
import { canRegisterPatients } from './permissions';
import type { Appointment, Patient } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  initialPatient?: Patient | null;
  /** Pre-filled values, e.g. a slot picked in the scheduler. The wizard opens at the first incomplete step. */
  initial?: Partial<BookingDraft>;
}

/** Guided 5-step booking. State is held here, so it is preserved across steps (and while registering a patient). */
export function BookAppointmentModal({ open, onClose, initialPatient, initial }: Props) {
  const qc = useQueryClient();
  const canRegister = canRegisterPatients(useAuthStore((s) => s.user?.role));
  const book = useBookAppointment();
  const submitting = useRef(false); // synchronous guard: state alone can lag behind a double-click

  const [draft, setDraft] = useState<BookingDraft>(() => emptyDraft(todayISO()));
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // e.g. slot conflict
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Appointment | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d: BookingDraft = { ...emptyDraft(todayISO()), ...initial, patient: initialPatient ?? initial?.patient ?? null };
    setDraft(d);
    setStep(initial || initialPatient ? startStepFor(d) : 0);
    setStepError(null); setNotice(null); setSubmitError(null); setCreated(null);
    submitting.current = false;
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (p: Partial<BookingDraft>) => { setDraft((d) => ({ ...d, ...p })); setStepError(null); };
  const setSlot = useCallback((slot: string) => setDraft((d) => (d.slot === slot ? d : { ...d, slot })), []);

  const handleClose = () => { if (!submitting.current) onClose(); };

  const next = () => {
    const err = validateStep(step, draft);
    if (err) { setStepError(err); return; }
    setStepError(null); setNotice(null);
    setStep((s) => Math.min(s + 1, LAST_STEP));
  };
  const back = () => { setStepError(null); setSubmitError(null); setStep((s) => Math.max(s - 1, 0)); };

  const confirm = async () => {
    if (submitting.current || created) return; // prevent duplicate submissions
    const bad = firstInvalidStep(draft);
    if (bad !== -1) { setStep(bad); setStepError(validateStep(bad, draft)); return; }
    submitting.current = true;
    setSubmitError(null);
    try {
      const appt = await book.mutateAsync({
        patientId: draft.patient!.id,
        doctorId: draft.doctor!.id,
        scheduledAt: draft.slot,
        reason: draft.reason.trim(),
      });
      setCreated(appt); // confirmation is only ever shown after the backend confirms
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 409) {
        // Someone else took the slot: refresh availability and send the user back to choose again.
        qc.invalidateQueries({ queryKey: ['slots'] });
        setDraft((d) => ({ ...d, slot: '' }));
        setStep(1);
        setNotice(`That time was just booked by someone else${err.message ? ` (${err.message})` : ''}. Availability has been refreshed — please pick another slot.`);
      } else {
        setSubmitError(err.message);
      }
    } finally {
      submitting.current = false;
    }
  };

  const doctorName = draft.doctor?.name ?? '';
  const when = draft.slot ? `${formatDate(draft.slot)} at ${formatTime(draft.slot)}` : '';

  return (
    <>
      <Modal open={open && !registering} onClose={handleClose} title={created ? 'Appointment booked' : 'Book appointment'} wide>
        {!created && <Stepper step={step} onJump={(s) => { if (s < step) { setStepError(null); setStep(s); } }} />}

        <div className="mt-5 min-h-[16rem]">
          {notice && step === 1 && (
            <div role="alert" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">{notice}</div>
          )}

          {created ? (
            <Confirmation appt={created} draft={draft} />
          ) : step === 0 ? (
            <DoctorSelector
              allowAllDepartments={false}
              layout="stack"
              value={{ departmentId: draft.departmentId, doctor: draft.doctor }}
              onChange={(v) => patch({ departmentId: v.departmentId, doctor: v.doctor, ...(v.doctor?.id !== draft.doctor?.id ? { slot: '' } : {}) })}
            />
          ) : step === 1 ? (
            <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
              <div>
                <p className="field-label">Date</p>
                <DatePicker value={draft.date} min={todayISO()} label="Appointment date" onChange={(date) => patch({ date, slot: '' })} />
              </div>
              <div>
                <p className="field-label">Time slot</p>
                <SlotGrid doctorId={draft.doctor?.id} date={draft.date} selected={draft.slot} onSelect={setSlot} />
              </div>
            </div>
          ) : step === 2 ? (
            <div>
              {draft.patient ? (
                <div className="flex items-center justify-between rounded-lg border border-sage bg-soft px-4 py-3 text-sm">
                  <span>
                    <span className="block font-medium">{draft.patient.name}</span>
                    <span className="block text-xs text-muted">
                      {[draft.patient.patientCode && `ID ${draft.patient.patientCode}`, draft.patient.phone].filter(Boolean).join(' · ') || 'No contact details'}
                    </span>
                  </span>
                  <button type="button" onClick={() => patch({ patient: null })} className="font-medium text-primary hover:text-primary-hover">Change</button>
                </div>
              ) : (
                <>
                  <PatientSearch onSelect={(p) => patch({ patient: p })} onRegister={() => setRegistering(true)} autoFocus />
                  {canRegister && (
                    <Button variant="secondary" size="sm" className="mt-4" onClick={() => setRegistering(true)}>
                      <UserPlus className="h-4 w-4" aria-hidden /> Register new patient
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : step === 3 ? (
            <div className="space-y-5">
              <TextAreaField label="Purpose of visit" required maxLength={300} value={draft.reason}
                onChange={(e) => patch({ reason: e.target.value })} hint={`${draft.reason.length}/300`} />
              <Summary draft={draft} />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted">Check the details below, then confirm. The appointment is only created once the server accepts it.</p>
              <Summary draft={draft} />
              {submitError && <Alert tone="error">{submitError}</Alert>}
            </div>
          )}

          {stepError && <p role="alert" className="mt-4 text-sm font-medium text-danger">{stepError}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          {created ? (
            <>
              <Button variant="secondary" onClick={() => { setCreated(null); setDraft(emptyDraft(todayISO())); setStep(0); }}>Book another</Button>
              <Button onClick={onClose}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={step === 0 ? handleClose : back} disabled={book.isPending}>{step === 0 ? 'Cancel' : 'Back'}</Button>
              {step < LAST_STEP ? (
                <Button onClick={next}>{step === 3 ? 'Review & continue' : 'Next'}</Button>
              ) : (
                <Button onClick={confirm} loading={book.isPending} disabled={book.isPending}>Confirm booking</Button>
              )}
            </>
          )}
        </div>
        <span className="sr-only" aria-live="polite">{created ? `Appointment booked with ${doctorName} ${when}` : `Step ${step + 1} of ${STEP_LABELS.length}: ${STEP_LABELS[step]}`}</span>
      </Modal>

      <PatientFormModal open={registering} onClose={() => setRegistering(false)} onCreated={(p) => patch({ patient: p })} />
    </>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (s: number) => void }) {
  return (
    <ol className="flex items-center gap-1 text-xs sm:gap-2" aria-label="Booking progress">
      {STEP_LABELS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
            <button type="button" disabled={!done} onClick={() => onJump(i)} className="flex items-center gap-2 disabled:cursor-default" aria-label={`Step ${i + 1}: ${label}${done ? ' (completed)' : current ? ' (current)' : ''}`}>
              <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold',
                done && 'border-primary bg-primary text-primary-fg', current && 'border-primary bg-soft text-primary', !done && !current && 'border-line text-muted')}>
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={clsx('hidden sm:inline', current ? 'font-semibold text-ink' : 'text-muted')}>{label}</span>
            </button>
            {i < STEP_LABELS.length - 1 && <span aria-hidden className={clsx('h-px flex-1', done ? 'bg-primary' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ draft }: { draft: BookingDraft }) {
  const rows: [string, string][] = [
    ['Patient', draft.patient?.name ?? '—'],
    ['Doctor', draft.doctor ? `${draft.doctor.name} — ${draft.doctor.specialization}` : '—'],
    ['Department', draft.doctor?.department?.name ?? '—'],
    ['Date & time', draft.slot ? `${formatDate(draft.slot)}, ${formatTime(draft.slot)}` : '—'],
    ['Purpose', draft.reason.trim() || '—'],
  ];
  return (
    <dl className="divide-y divide-line rounded-lg border border-line text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-4 px-4 py-2.5"><dt className="w-28 shrink-0 text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
      ))}
    </dl>
  );
}

function Confirmation({ appt, draft }: { appt: Appointment; draft: BookingDraft }) {
  // Prefer what the server returned; fall back to the draft only for relations the response omits.
  const rows: [string, string][] = [
    ['Reference', appt.id],
    ['Patient', appt.patient?.name ?? draft.patient?.name ?? '—'],
    ['Doctor', appt.doctor?.name ?? draft.doctor?.name ?? '—'],
    ['Date & time', `${formatDate(appt.scheduledAt)}, ${formatTime(appt.scheduledAt)}`],
    ['Purpose', appt.reason ?? '—'],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-success">
        <CheckCircle2 className="h-6 w-6" aria-hidden />
        <p className="font-semibold">Appointment confirmed by the server.</p>
      </div>
      <dl className="divide-y divide-line rounded-lg border border-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-2.5"><dt className="w-28 shrink-0 text-muted">{k}</dt><dd className="break-all font-medium">{v}</dd></div>
        ))}
        <div className="flex gap-4 px-4 py-2.5"><dt className="w-28 shrink-0 text-muted">Status</dt><dd><StatusBadge status={appt.status} /></dd></div>
      </dl>
    </div>
  );
}
