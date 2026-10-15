import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { patientsApi, type PatientInput } from '@/api/services';
import { toApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';
import type { Patient } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the patient’s full name'),
  // Separators are stripped before sending; the backend wants 7-15 digits with an optional leading +.
  phone: z.string().trim().refine((v) => /^\+?[0-9]{7,15}$/.test(v.replace(/[\s\-().]/g, '')), 'Enter a valid mobile number (7-15 digits)'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['', 'MALE', 'FEMALE', 'OTHER']).optional(),
});
type Values = z.infer<typeof schema>;

export function PatientFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (p: Patient) => void }) {
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', dateOfBirth: '', gender: '' },
  });

  const create = useMutation({
    mutationFn: (input: PatientInput) => patientsApi.create(input),
    onSuccess: (p) => {
      toast.success(`Patient ${p.name} registered.`);
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      reset();
      onCreated?.(p);
      onClose();
    },
  });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        name: v.name,
        phone: v.phone,
        email: v.email || undefined,
        dateOfBirth: v.dateOfBirth || undefined,
        gender: v.gender || undefined,
      });
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      setFormError(err.message);
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Register patient">
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Mobile" type="tel" required error={errors.phone?.message} {...register('phone')} />
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
          <SelectField label="Gender" error={errors.gender?.message} {...register('gender')}>
            <option value="">Prefer not to say</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </SelectField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Register patient</Button>
        </div>
      </form>
    </Modal>
  );
}
