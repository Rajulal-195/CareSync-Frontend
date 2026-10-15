import { PageHeader } from '@/components/ui/Layout';
import { AppointmentList } from '@/features/appointments/AppointmentList';

export default function DoctorAppointmentsPage() {
  return (
    <>
      <PageHeader title="My appointments" />
      <AppointmentList scope="mine" showDoctor={false} manage />
    </>
  );
}
