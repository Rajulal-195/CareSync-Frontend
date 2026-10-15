import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Layout';
import { EmptyState, QueryBoundary } from '@/components/ui/feedback';
import { AppointmentTable } from '@/features/appointments/AppointmentTable';
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal';
import { useAppointments } from '@/features/appointments/hooks';
import { PatientSearch } from '@/features/patients/PatientSearch';
import { PatientFormModal } from '@/features/patients/PatientFormModal';
import { todayISO } from '@/utils/format';
import type { Patient } from '@/types';

export default function ReceptionDashboard() {
  const [booking, setBooking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [picked, setPicked] = useState<Patient | null>(null);

  const today = todayISO();
  const asc = { sortBy: 'scheduledAt', sortOrder: 'asc' } as const;
  const todays = useAppointments({ date: today, limit: 50, ...asc });
  const upcoming = useAppointments({ from: today, status: 'SCHEDULED', limit: 10, ...asc });
  const arrived = useAppointments({ date: today, status: 'ARRIVED', limit: 50, ...asc });

  const startBooking = (p: Patient | null) => { setPicked(p); setBooking(true); };

  return (
    <>
      <PageHeader
        title="Reception"
        description="Today’s appointments, arrivals and patient lookup."
        actions={
          <>
            <Button variant="secondary" onClick={() => setRegistering(true)}><UserPlus className="h-4 w-4" aria-hidden /> Register patient</Button>
            <Button onClick={() => startBooking(null)}><CalendarPlus className="h-4 w-4" aria-hidden /> Book appointment</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Today’s appointments" actions={<Link className="text-sm font-medium text-primary hover:text-primary-hover" to="/reception/appointments">View all</Link>}>
            <QueryBoundary isLoading={todays.isLoading} isError={todays.isError} error={todays.error} isEmpty={!todays.data?.items.length} onRetry={() => todays.refetch()}
              empty={<EmptyState title="No appointments today" action={<Button size="sm" onClick={() => startBooking(null)}>Book one</Button>} />}>
              <AppointmentTable items={todays.data?.items ?? []} manage />
            </QueryBoundary>
          </Card>

          <Card title="Upcoming appointments">
            <QueryBoundary isLoading={upcoming.isLoading} isError={upcoming.isError} error={upcoming.error} isEmpty={!upcoming.data?.items.length} onRetry={() => upcoming.refetch()}
              empty={<EmptyState title="Nothing scheduled ahead" />}>
              <AppointmentTable items={upcoming.data?.items ?? []} manage />
            </QueryBoundary>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Patient search">
            <div className="p-5">
              <PatientSearch onSelect={startBooking} onRegister={() => setRegistering(true)} />
              <p className="mt-3 text-xs text-muted">Select a patient to start booking.</p>
            </div>
          </Card>

          <Card title={`Arrived patients${arrived.data ? ` (${arrived.data.items.length})` : ''}`}>
            <QueryBoundary isLoading={arrived.isLoading} isError={arrived.isError} error={arrived.error} isEmpty={!arrived.data?.items.length} onRetry={() => arrived.refetch()}
              empty={<EmptyState title="No patients waiting" />}>
              <ul className="divide-y divide-line">
                {arrived.data?.items.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{a.patient?.name ?? 'Patient'}</p>
                    <p className="text-xs text-muted">with {a.doctor?.name ?? 'doctor'}</p>
                  </li>
                ))}
              </ul>
            </QueryBoundary>
          </Card>
        </div>
      </div>

      <BookAppointmentModal open={booking} onClose={() => setBooking(false)} initialPatient={picked} />
      <PatientFormModal open={registering} onClose={() => setRegistering(false)} onCreated={(p) => startBooking(p)} />
    </>
  );
}
