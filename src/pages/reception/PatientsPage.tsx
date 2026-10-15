import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Layout';
import { PatientSearch } from '@/features/patients/PatientSearch';
import { PatientFormModal } from '@/features/patients/PatientFormModal';
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal';
import type { Patient } from '@/types';

export default function PatientsPage() {
  const [registering, setRegistering] = useState(false);
  const [booking, setBooking] = useState<Patient | null>(null);
  return (
    <>
      <PageHeader title="Patients" description="Search existing patients or register a new one."
        actions={<Button onClick={() => setRegistering(true)}><UserPlus className="h-4 w-4" aria-hidden /> Register patient</Button>} />
      <Card><div className="p-5"><PatientSearch onSelect={setBooking} onRegister={() => setRegistering(true)} /></div></Card>
      <p className="mt-2 text-xs text-muted">Selecting a patient opens the booking form.</p>
      <PatientFormModal open={registering} onClose={() => setRegistering(false)} />
      <BookAppointmentModal open={!!booking} initialPatient={booking} onClose={() => setBooking(null)} />
    </>
  );
}
