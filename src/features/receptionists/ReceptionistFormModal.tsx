import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { receptionistsApi, type ReceptionistInput } from '@/api/services';
import { toApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the receptionist’s full name'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z
    .string()
    .min(12, 'Temporary password must be at least 12 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number'),
});
type Values = z.infer<typeof schema>;

export function ReceptionistFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });

  useEffect(() => {
    if (open) { reset(); setFormError(null); }
  }, [open, reset]);

  const create = useMutation({
    mutationFn: (input: ReceptionistInput) => receptionistsApi.create(input),
    onSuccess: (r) => {
      toast.success(`${r.name} added as a receptionist.`);
      qc.invalidateQueries({ queryKey: ['receptionists'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await create.mutateAsync({ name: v.name, email: v.email, password: v.password });
    } catch (e) {
      const err = toApiError(e);
      const fields = Object.entries(err.fieldErrors ?? {});
      fields.forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      // 409 usually means the email is already registered.
      setFormError(err.status === 409 && !fields.length ? `${err.message} (is this email already registered?)` : err.message);
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Add receptionist">
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email" type="email" required autoComplete="off" error={errors.email?.message} {...register('email')} />
        </div>
        <TextField label="Temporary password" type="password" autoComplete="new-password" required hint="At least 12 characters with a letter and a number. Ask them to change it after first sign-in." error={errors.password?.message} {...register('password')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Add receptionist</Button>
        </div>
      </form>
    </Modal>
  );
}
