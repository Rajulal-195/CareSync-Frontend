import { SelectField } from '@/components/ui/Field';
import { useDepartments, useDoctors } from '@/features/doctors/hooks';
import type { Doctor } from '@/types';

export interface DoctorSelection {
  departmentId: string;
  doctor: Doctor | null;
}

interface Props {
  value: DoctorSelection;
  onChange: (v: DoctorSelection) => void;
  /** When false the department is mandatory and the doctor list stays locked until one is chosen. */
  allowAllDepartments?: boolean;
  layout?: 'row' | 'stack';
}

export function DoctorSelector({ value, onChange, allowAllDepartments = true, layout = 'row' }: Props) {
  const depts = useDepartments();
  const needsDept = !allowAllDepartments && !value.departmentId;
  const doctors = useDoctors({ departmentId: value.departmentId || undefined, limit: 100 }, !needsDept);

  const items = doctors.data?.items ?? [];
  // Keep a pre-selected doctor visible even before/without the list containing them.
  const options = value.doctor && !items.some((d) => d.id === value.doctor!.id) ? [value.doctor, ...items] : items;

  return (
    <div className={layout === 'row' ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}>
      <SelectField
        label="Department"
        required={!allowAllDepartments}
        value={value.departmentId}
        disabled={depts.isLoading}
        onChange={(e) => onChange({ departmentId: e.target.value, doctor: null })}
        error={depts.isError ? 'Could not load departments.' : undefined}
      >
        <option value="">{depts.isLoading ? 'Loading…' : allowAllDepartments ? 'All departments' : 'Select department'}</option>
        {depts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </SelectField>

      <SelectField
        label="Doctor"
        required
        value={value.doctor?.id ?? ''}
        disabled={needsDept || doctors.isLoading}
        hint={needsDept ? 'Choose a department first.' : undefined}
        onChange={(e) => onChange({ departmentId: value.departmentId, doctor: options.find((d) => d.id === e.target.value) ?? null })}
        error={doctors.isError ? 'Could not load doctors.' : undefined}
      >
        <option value="">{doctors.isLoading ? 'Loading…' : 'Select doctor'}</option>
        {options.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
      </SelectField>

      {!needsDept && !doctors.isLoading && !doctors.isError && items.length === 0 && (
        <p className="text-sm text-muted sm:col-span-2">No doctors found{value.departmentId ? ' in this department' : ''}.</p>
      )}
    </div>
  );
}
