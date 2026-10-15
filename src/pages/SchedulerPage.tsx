import { useCallback, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Layout';
import { DatePicker } from '@/components/ui/DatePicker';
import { DoctorSelector, type DoctorSelection } from '@/features/scheduler/DoctorSelector';
import { SlotGrid } from '@/features/scheduler/SlotGrid';
import { useLiveSlots } from '@/features/scheduler/hooks';
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal';
import { formatDate, formatTime, todayISO } from '@/utils/format';

/** Browse a doctor's live availability and start a booking from a chosen slot. */
export default function SchedulerPage() {
  const [sel, setSel] = useState<DoctorSelection>({ departmentId: '', doctor: null });
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState('');
  const [booking, setBooking] = useState(false);

  useLiveSlots(sel.doctor?.id, date);

  const pickSlot = useCallback((s: string) => setSlot(s), []);

  return (
    <>
      <PageHeader title="Scheduler" description="Live availability by department and doctor. Availability is decided by the server." />

      <Card className="mb-6">
        <div className="p-5">
          <DoctorSelector value={sel} onChange={(v) => { setSel(v); setSlot(''); }} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card title="Date">
          <div className="p-4"><DatePicker value={date} min={todayISO()} label="Scheduler date" onChange={(d) => { setDate(d); setSlot(''); }} /></div>
        </Card>

        <Card
          title={sel.doctor ? `${sel.doctor.name} — ${formatDate(`${date}T00:00:00`)}` : 'Available slots'}
          actions={
            <Button size="sm" disabled={!slot} onClick={() => setBooking(true)}>
              <CalendarPlus className="h-4 w-4" aria-hidden /> {slot ? `Book ${formatTime(slot)}` : 'Select a slot'}
            </Button>
          }
        >
          <div className="p-5">
            <SlotGrid doctorId={sel.doctor?.id} date={date} selected={slot} onSelect={pickSlot} />
          </div>
        </Card>
      </div>

      <BookAppointmentModal
        open={booking}
        onClose={() => { setBooking(false); setSlot(''); }}
        initial={{ departmentId: sel.departmentId || sel.doctor?.departmentId || sel.doctor?.department?.id || '', doctor: sel.doctor, date, slot }}
      />
    </>
  );
}
