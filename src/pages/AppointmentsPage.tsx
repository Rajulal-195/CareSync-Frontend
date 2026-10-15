import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Layout';
import { AppointmentList } from '@/features/appointments/AppointmentList';
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal';

/** Shared by Super Admin and Receptionist; booking is available to both. */
export default function AppointmentsPage() {
  const [booking, setBooking] = useState(false);
  return (
    <>
      <PageHeader title="Appointments" actions={<Button onClick={() => setBooking(true)}><CalendarPlus className="h-4 w-4" aria-hidden /> Book appointment</Button>} />
      <AppointmentList manage />
      <BookAppointmentModal open={booking} onClose={() => setBooking(false)} />
    </>
  );
}
