import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { toApiError } from '@/api/client';
import { formatDate, formatTime } from '@/utils/format';
import { useCancelAppointment } from './hooks';
import type { Appointment } from '@/types';

/** Confirmation step for cancellation. The record is kept; the backend marks it CANCELLED. */
export function CancelDialog({ appointment, onClose }: { appointment: Appointment | null; onClose: () => void }) {
  const cancel = useCancelAppointment();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [appointment?.id]);

  // The backend requires a reason once the patient has arrived.
  const reasonRequired = appointment?.status === 'ARRIVED';

  const confirm = async () => {
    if (!appointment || cancel.isPending) return;
    if (reasonRequired && !reason.trim()) {
      setError('Enter a reason: the patient has already arrived.');
      return;
    }
    setError(null);
    try {
      await cancel.mutateAsync({ id: appointment.id, reason: reason.trim() || undefined });
      onClose();
    } catch (e) {
      setError(toApiError(e).message);
    }
  };

  return (
    <Modal open={!!appointment} onClose={() => !cancel.isPending && onClose()} title="Cancel appointment">
      {appointment && (
        <div className="space-y-4">
          <p className="text-sm">
            Cancel the appointment for <strong>{appointment.patient?.name ?? 'this patient'}</strong>
            {appointment.doctor?.name && <> with <strong>{appointment.doctor.name}</strong></>} on{' '}
            <strong>{formatDate(appointment.scheduledAt)} at {formatTime(appointment.scheduledAt)}</strong>?
          </p>
          <p className="text-sm text-muted">The record is kept and marked Cancelled, and the time slot is released.</p>
          <TextAreaField label={reasonRequired ? 'Reason (required)' : 'Reason (optional)'} required={reasonRequired} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>Keep appointment</Button>
            <Button variant="danger" onClick={confirm} loading={cancel.isPending}>Cancel appointment</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
