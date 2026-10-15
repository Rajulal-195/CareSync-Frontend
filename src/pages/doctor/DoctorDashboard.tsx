import { Link } from 'react-router-dom';
import { Card, PageHeader } from '@/components/ui/Layout';
import { EmptyState, QueryBoundary } from '@/components/ui/feedback';
import { AppointmentTable } from '@/features/appointments/AppointmentTable';
import { useAppointments } from '@/features/appointments/hooks';
import { todayISO } from '@/utils/format';

/**
 * Every query hits the doctor-scoped endpoint; the backend derives the doctor from the session and
 * no doctor id is ever sent. "View" on a row shows the patient's details and consultation notes.
 */
export default function DoctorDashboard() {
  const today = todayISO();
  const todays = useAppointments({ date: today, limit: 50, sortBy: 'scheduledAt', sortOrder: 'asc' }, 'mine');
  const upcoming = useAppointments({ from: today, status: 'SCHEDULED', limit: 10, sortBy: 'scheduledAt', sortOrder: 'asc' }, 'mine');

  return (
    <>
      <PageHeader title="My day" description="Your consultations and patient details." />

      <div className="space-y-6">
        <Card title="Today’s appointments">
          <QueryBoundary isLoading={todays.isLoading} isError={todays.isError} error={todays.error} isEmpty={!todays.data?.items.length} onRetry={() => todays.refetch()}
            empty={<EmptyState title="No consultations today" />}>
            <AppointmentTable items={todays.data?.items ?? []} showDoctor={false} manage />
          </QueryBoundary>
        </Card>

        <Card title="Upcoming consultations" actions={<Link className="text-sm font-medium text-primary hover:text-primary-hover" to="/doctor/appointments">All appointments</Link>}>
          <QueryBoundary isLoading={upcoming.isLoading} isError={upcoming.isError} error={upcoming.error} isEmpty={!upcoming.data?.items.length} onRetry={() => upcoming.refetch()}
            empty={<EmptyState title="No upcoming consultations" />}>
            <AppointmentTable items={upcoming.data?.items ?? []} showDoctor={false} />
          </QueryBoundary>
        </Card>
      </div>
    </>
  );
}
