import { useMemo, useState } from 'react';
import { useFieldArray, useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Layout';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { schedulesApi } from '@/api/services';
import { toApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';
import { formatDateTime } from '@/utils/format';
import type { DoctorSchedule, ScheduleConflict } from '@/types';
import {
  DAY_NAMES, DAY_ORDER, extractConflicts, newScheduleDraft, normalizeSchedule, validateSchedule,
} from './validation';

const SLOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function timezoneList(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const all = intl.supportedValuesOf?.('timeZone') ?? ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York'];
  return all.includes(current) || !current ? all : [current, ...all];
}

/** Resolver that runs the shared pure validation and nests issues by their dotted path. */
const resolver: Resolver<DoctorSchedule> = async (values) => {
  const issues = validateSchedule(values);
  if (!issues.length) return { values, errors: {} };
  const errors: Record<string, unknown> = {};
  for (const { path, message } of issues) {
    const keys = path.split('.');
    let cur = errors as Record<string, unknown>;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) cur[k] = { type: 'validation', message };
      else {
        cur[k] ??= /^\d+$/.test(keys[i + 1]) ? [] : {};
        cur = cur[k] as Record<string, unknown>;
      }
    });
  }
  return { values: {}, errors: errors as FieldErrors<DoctorSchedule> };
};

function errAt(errors: unknown, path: string): string | undefined {
  let cur: unknown = errors;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return (cur as { message?: string } | undefined)?.message;
}

export function ScheduleEditor({ doctorId }: { doctorId: string }) {
  const q = useQuery({ queryKey: ['schedule', doctorId], queryFn: ({ signal }) => schedulesApi.get(doctorId, signal) });

  if (q.isLoading) return <Card><Spinner label="Loading schedule…" /></Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;

  const isNew = q.data == null;
  const initial = q.data ? normalizeSchedule(q.data) : newScheduleDraft(browserTimezone());
  // Remount when the saved schedule changes so the form reflects what the backend stored.
  return <ScheduleForm key={`${doctorId}-${q.dataUpdatedAt}`} doctorId={doctorId} initial={initial} isNew={isNew} />;
}

function ScheduleForm({ doctorId, initial, isNew }: { doctorId: string; initial: DoctorSchedule; isNew: boolean }) {
  const qc = useQueryClient();
  const methods = useForm<DoctorSchedule>({ resolver, defaultValues: initial, mode: 'onSubmit', reValidateMode: 'onChange' });
  const { register, control, handleSubmit, setError, setValue, watch, formState: { errors, isDirty } } = methods;
  const sessions = useFieldArray({ control, name: 'sessions' });
  const breaks = useFieldArray({ control, name: 'breaks' });

  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<{ message: string; items: ScheduleConflict[] } | null>(null);
  const timezones = useMemo(() => timezoneList(initial.timezone), [initial.timezone]);

  const save = useMutation({
    mutationFn: (values: DoctorSchedule) => schedulesApi.save(doctorId, values),
    onSuccess: () => {
      toast.success('Schedule saved.');
      qc.invalidateQueries({ queryKey: ['schedule', doctorId] });
      qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors([]);
    setConflicts(null);
    try {
      await save.mutateAsync(values);
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 409 && err.code === 'SCHEDULE_CONFLICT') {
        // The change would orphan upcoming bookings. There is no override: they must be rescheduled or cancelled first.
        setConflicts({ message: err.message, items: extractConflicts(err.data) });
        return;
      }
      const lines: string[] = [];
      for (const [path, msg] of Object.entries(err.fieldErrors ?? {})) {
        if (/^(timezone|slotDuration|workingDays|sessions|breaks)/.test(path)) setError(path as keyof DoctorSchedule, { message: msg });
        lines.push(`${path}: ${msg}`);
      }
      setServerErrors(lines.length ? [err.message, ...lines] : [err.message]);
    }
  });

  const workingDays = watch('workingDays');
  const isActive = watch('isActive');
  const toggleDay = (d: number) => {
    const next = workingDays.includes(d) ? workingDays.filter((x) => x !== d) : [...workingDays, d];
    setValue('workingDays', next.sort((a, b) => a - b), { shouldDirty: true, shouldValidate: methods.formState.isSubmitted });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Doctor schedule">
      {isNew && (
        <Alert tone="info">
          No schedule is configured for this doctor yet. The values below are a starting point and are not saved until you save.
        </Alert>
      )}

      {serverErrors.length > 0 && (
        <Alert tone="error">
          <p className="font-medium">{serverErrors[0]}</p>
          {serverErrors.length > 1 && <ul className="mt-1 list-disc pl-5">{serverErrors.slice(1).map((l) => <li key={l}>{l}</li>)}</ul>}
        </Alert>
      )}

      {conflicts && (
        <div role="alert" aria-labelledby="conf-title" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm">
          <p id="conf-title" className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden /> This change would affect existing appointments
          </p>
          <p className="mt-1 text-ink">{conflicts.message}</p>
          {conflicts.items.length > 0 && (
            <>
              <p className="mt-2 text-muted">Affected appointments{conflicts.items.length === 50 ? ' (first 50)' : ''}:</p>
              <ul className="mt-1 max-h-36 list-disc overflow-y-auto pl-5 text-ink">
                {conflicts.items.map((c, i) => (
                  <li key={c.appointmentId ?? i}>{formatDateTime(c.scheduledAt)}{c.reason ? ` — ${c.reason}` : ''}</li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => setConflicts(null)}>Keep editing</Button>
          </div>
        </div>
      )}

      <Card title="General">
        <div className="grid gap-5 p-5 sm:grid-cols-3">
          <div>
            <label htmlFor="sch-tz" className="field-label">Timezone</label>
            <select id="sch-tz" className="field-input" aria-invalid={!!errAt(errors, 'timezone')} {...register('timezone')}>
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <FieldError message={errAt(errors, 'timezone')} />
          </div>
          <div>
            <label htmlFor="sch-dur" className="field-label">Slot duration</label>
            <select id="sch-dur" className="field-input" aria-invalid={!!errAt(errors, 'slotDuration')} {...register('slotDuration', { valueAsNumber: true })}>
              {(SLOT_OPTIONS.includes(initial.slotDuration) ? SLOT_OPTIONS : [initial.slotDuration, ...SLOT_OPTIONS]).map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <FieldError message={errAt(errors, 'slotDuration')} />
          </div>
          <div>
            <span className="field-label">Schedule status</span>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" role="switch" className="h-5 w-5 accent-primary" {...register('isActive')} />
              <span>{isActive ? 'Active — slots are bookable' : 'Inactive — no slots offered'}</span>
            </label>
          </div>
        </div>
      </Card>

      <Card title="Working days">
        <fieldset className="px-5 py-4">
          <legend className="sr-only">Working days</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {DAY_ORDER.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={workingDays.includes(d)} onChange={() => toggleDay(d)} />
                {DAY_NAMES[d]}
              </label>
            ))}
          </div>
          <FieldError message={errAt(errors, 'workingDays')} />
        </fieldset>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Sessions">
          <div className="space-y-2 p-5">
            <p className="text-xs text-muted">Sessions apply to every working day. Slots are generated inside them.</p>
            {sessions.fields.map((f, si) => (
              <TimeRow key={f.id} kind="Session" n={si + 1}
                startProps={register(`sessions.${si}.start`)} endProps={register(`sessions.${si}.end`)}
                startErr={errAt(errors, `sessions.${si}.start`)} endErr={errAt(errors, `sessions.${si}.end`)}
                onRemove={() => sessions.remove(si)} />
            ))}
            <FieldError message={errAt(errors, 'sessions.root') ?? errAt(errors, 'sessions')} />
            <Button size="sm" variant="ghost" onClick={() => sessions.append({ start: '', end: '' })}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add session
            </Button>
          </div>
        </Card>

        <Card title="Breaks">
          <div className="space-y-2 p-5">
            <p className="text-xs text-muted">No slots are generated during a break. Each break must sit inside one session.</p>
            {breaks.fields.length === 0 && <p className="text-sm text-muted">No breaks.</p>}
            {breaks.fields.map((f, bi) => (
              <TimeRow key={f.id} kind="Break" n={bi + 1}
                startProps={register(`breaks.${bi}.start`)} endProps={register(`breaks.${bi}.end`)}
                startErr={errAt(errors, `breaks.${bi}.start`)} endErr={errAt(errors, `breaks.${bi}.end`)}
                onRemove={() => breaks.remove(bi)} />
            ))}
            <FieldError message={errAt(errors, 'breaks.root') ?? errAt(errors, 'breaks')} />
            <Button size="sm" variant="ghost" onClick={() => breaks.append({ start: '', end: '' })}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add break
            </Button>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        {isDirty && <span className="text-sm text-muted">Unsaved changes</span>}
        <Button variant="secondary" disabled={!isDirty || save.isPending} onClick={() => { methods.reset(initial); setServerErrors([]); setConflicts(null); }}>Discard</Button>
        <Button type="submit" loading={save.isPending}>Save schedule</Button>
      </div>
    </form>
  );
}

function FieldError({ message, className = '' }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p role="alert" className={`mt-1 text-xs font-medium text-danger ${className}`}>{message}</p>;
}

function TimeRow({ kind, n, startProps, endProps, startErr, endErr, onRemove }: {
  kind: string; n: number;
  startProps: React.InputHTMLAttributes<HTMLInputElement>; endProps: React.InputHTMLAttributes<HTMLInputElement>;
  startErr?: string; endErr?: string; onRemove: () => void;
}) {
  const label = `${kind} ${n}`;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input type="time" step={300} aria-label={`${label} start`} aria-invalid={!!startErr} className="field-input h-9 w-auto py-1" {...startProps} />
        <span aria-hidden className="text-muted">–</span>
        <input type="time" step={300} aria-label={`${label} end`} aria-invalid={!!endErr} className="field-input h-9 w-auto py-1" {...endProps} />
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger">
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <FieldError message={startErr} />
      <FieldError message={endErr} />
    </div>
  );
}
