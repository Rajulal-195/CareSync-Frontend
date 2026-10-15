import { useState } from 'react';
import { Card, PageHeader } from '@/components/ui/Layout';
import { SelectField } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/feedback';
import { ScheduleEditor } from '@/features/schedules/ScheduleEditor';
import { useDoctors } from '@/features/doctors/hooks';

export default function SchedulesPage() {
  const [doctorId, setDoctorId] = useState('');
  const doctors = useDoctors({ limit: 100 });

  return (
    <>
      <PageHeader title="Doctor schedules" description="Configure working days, sessions, breaks and slot length. Slot availability is always computed by the server." />
      <Card className="mb-6">
        <div className="p-5 sm:max-w-md">
          <SelectField label="Doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={doctors.isLoading}
            error={doctors.isError ? 'Could not load doctors. Reload the page to try again.' : undefined}>
            <option value="">{doctors.isLoading ? 'Loading…' : 'Select doctor'}</option>
            {doctors.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
          </SelectField>
        </div>
      </Card>
      {doctorId
        ? <ScheduleEditor doctorId={doctorId} />
        : <Card><EmptyState title="Select a doctor" description="Choose a doctor to view or edit their weekly schedule." /></Card>}
    </>
  );
}
