import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { toApiError } from '@/api/client';
import { useDepartments, useSaveDoctor } from './hooks';
import type { Doctor } from '@/types';

const base = z.object({
  name: z.string().trim().min(2, 'Enter the doctor’s full name'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  specialization: z.string().trim().min(2, 'Specialization is required'),
  departmentId: z.string().min(1, 'Select a department'),
  password: z.string().optional(),
});
// Backend password rule: 12-72 characters with at least one letter and one digit.
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{12,72}$/;
type Values = z.infer<typeof base>;

export function DoctorFormModal({ open, doctor, onClose }: { open: boolean; doctor?: Doctor | null; onClose: () => void }) {
  const editing = !!doctor;
  const [formError, setFormError] = useState<string | null>(null);
  const depts = useDepartments();
  const save = useSaveDoctor();

  // Password is required only when creating.
  const schema = base.superRefine((v, ctx) => {
    if (!editing && !PASSWORD_RULE.test(v.password ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use 12+ characters with at least one letter and one number' });
    }
  });

  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', specialization: '', departmentId: '', password: '' },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset({
      name: doctor?.name ?? '',
      email: doctor?.email ?? '',
      specialization: doctor?.specialization ?? '',
      departmentId: doctor?.departmentId ?? doctor?.department?.id ?? '',
      password: '',
    });
  }, [open, doctor, reset]);

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await save.mutateAsync({
        id: doctor?.id,
        input: {
          name: v.name, specialization: v.specialization, departmentId: v.departmentId,
          // The backend does not allow changing a doctor's email, so it is only sent on create.
          ...(editing ? {} : { email: v.email, password: v.password }),
        },
      });
      onClose();
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      setFormError(err.message);
    }
  });

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit doctor' : 'Add doctor'}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email" type="email" required readOnly={editing} hint={editing ? 'Email cannot be changed.' : undefined} error={errors.email?.message} {...register('email')} />
          <TextField label="Specialization" required error={errors.specialization?.message} {...register('specialization')} />
          <SelectField
            label="Department"
            required
            disabled={depts.isLoading}
            error={errors.departmentId?.message ?? (depts.isError ? 'Could not load departments' : undefined)}
            {...register('departmentId')}
          >
            <option value="">{depts.isLoading ? 'Loading…' : 'Select department'}</option>
            {depts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectField>
        </div>
        {!editing && (
          <TextField label="Temporary password" type="password" autoComplete="new-password" required hint="At least 12 characters with a letter and a number. The doctor should change it after first sign-in." error={errors.password?.message} {...register('password')} />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Add doctor'}</Button>
        </div>
      </form>
    </Modal>
  );
}
