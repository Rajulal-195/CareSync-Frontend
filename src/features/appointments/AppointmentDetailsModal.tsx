import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toApiError } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/utils/format';
import type { AppointmentEditInput } from '@/api/services';
import { availableActions, editableFields, type EditableField } from './permissions';
import { useAppointment, useEditAppointment, useUpdateStatus, type ForwardStatus } from './hooks';
import type { Appointment } from '@/types';

interface Props {
  appointment: Appointment | null;
  onClose: () => void;
  /** Cancellation is confirmed in its own dialog, owned by the caller. */
  onRequestCancel: (a: Appointment) => void;
}

export function AppointmentDetailsModal({ appointment, onClose, onRequestCancel }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const q = useAppointment(appointment?.id, appointment ?? undefined);
  const update = useUpdateStatus();
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [appointment?.id]);

  const a = q.data ?? appointment;
  const actions = a ? availableActions(role, a.status) : [];
  const fields = a ? editableFields(role, a.status) : [];
  const busy = update.isPending;

  return (
    <Modal open={!!appointment} onClose={onClose} title="Appointment details" wide>
      {a && (
        <div className="space-y-5">
          {q.isError && (
            <Alert tone="warning">
              Couldn’t refresh these details: {toApiError(q.error).message} Showing the last known version.
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status={a.status} />
            <p className="text-sm text-muted">{formatDateTime(a.scheduledAt)}</p>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item k="Reference" v={a.id} />
            <Item k="Doctor" v={a.doctor ? `${a.doctor.name}${a.doctor.specialization ? ` — ${a.doctor.specialization}` : ''}` : null} />
            <div className="sm:col-span-2"><Item k="Purpose" v={a.reason} /></div>
            {a.status === 'CANCELLED' && <div className="sm:col-span-2"><Item k="Cancellation reason" v={a.cancelReason} /></div>}
          </dl>

          <section aria-labelledby="pat-h">
            <h3 id="pat-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Patient</h3>
            <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-line p-4 text-sm sm:grid-cols-2">
              <Item k="Name" v={a.patient?.name} />
              <Item k="Patient ID" v={a.patient?.patientCode ?? a.patientId} />
              <Item k="Mobile" v={a.patient?.phone} />
              <Item k="Email" v={a.patient?.email} />
              <Item k="Gender" v={a.patient?.gender?.toLowerCase()} />
              <Item k="Date of birth" v={a.patient?.dateOfBirth} />
            </dl>
          </section>

          {editing ? (
            <EditForm appointment={a} fields={fields} onDone={() => setEditing(false)} />
          ) : (
            <>
              <section aria-labelledby="notes-h">
                <h3 id="notes-h" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h3>
                <p className="whitespace-pre-wrap text-sm">{a.notes || <span className="text-muted">No notes.</span>}</p>
              </section>
              {role === 'DOCTOR' && (
                <section aria-labelledby="cnotes-h">
                  <h3 id="cnotes-h" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Consultation notes</h3>
                  <p className="whitespace-pre-wrap text-sm">{a.consultationNotes || <span className="text-muted">No consultation notes.</span>}</p>
                </section>
              )}
            </>
          )}

          {!editing && (actions.length > 0 || fields.length > 0) && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              {fields.length > 0 && (
                <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </Button>
              )}
              {actions.map((x) => (
                <Button
                  key={x.status}
                  variant={x.status === 'CANCELLED' ? 'secondary' : 'primary'}
                  loading={busy && update.variables?.status === x.status}
                  disabled={busy}
                  onClick={() => (x.status === 'CANCELLED' ? onRequestCancel(a) : update.mutate({ id: a.id, status: x.status as ForwardStatus }))}
                >
                  {x.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Item({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="mt-0.5 break-words font-medium first-letter:uppercase">{v || '—'}</dd>
    </div>
  );
}

interface EditValues { reason?: string; notes?: string; consultationNotes?: string }

function EditForm({ appointment, fields, onDone }: { appointment: Appointment; fields: EditableField[]; onDone: () => void }) {
  const edit = useEditAppointment();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        reason: fields.includes('reason')
          ? z.string().trim().min(3, 'Enter the purpose of the visit (at least 3 characters)').max(300, 'Keep it under 300 characters')
          : z.string().optional(),
        notes: fields.includes('notes') ? z.string().trim().max(2000, 'Keep notes under 2000 characters').optional() : z.string().optional(),
        consultationNotes: fields.includes('consultationNotes')
          ? z.string().trim().max(10000, 'Keep consultation notes under 10000 characters').optional()
          : z.string().optional(),
      }),
    [fields],
  );

  const { register, handleSubmit, setError, formState: { errors, isDirty } } = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: appointment.reason ?? '', notes: appointment.notes ?? '', consultationNotes: appointment.consultationNotes ?? '' },
  });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    // Only the fields this role may edit are sent; the backend remains the authority.
    const input: AppointmentEditInput = {};
    if (fields.includes('reason')) input.reason = v.reason;
    if (fields.includes('notes')) input.notes = v.notes ?? '';
    if (fields.includes('consultationNotes')) input.consultationNotes = v.consultationNotes ?? '';
    try {
      await edit.mutateAsync({ id: appointment.id, input });
      onDone();
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([k, m]) => {
        if (k === 'reason' || k === 'notes' || k === 'consultationNotes') setError(k, { message: m });
      });
      setFormError(err.message);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-line p-4" aria-label="Edit appointment">
      {formError && <Alert tone="error">{formError}</Alert>}
      {fields.includes('reason') && <TextAreaField label="Purpose of visit" required maxLength={300} error={errors.reason?.message} {...register('reason')} />}
      {fields.includes('notes') && <TextAreaField label="Notes" rows={4} maxLength={2000} error={errors.notes?.message} {...register('notes')} />}
      {fields.includes('consultationNotes') && <TextAreaField label="Consultation notes" rows={5} maxLength={10000} error={errors.consultationNotes?.message} {...register('consultationNotes')} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={edit.isPending}>Discard</Button>
        <Button type="submit" loading={edit.isPending} disabled={!isDirty}>Save changes</Button>
      </div>
    </form>
  );
}
