import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Card, PageHeader } from '@/components/ui/Layout';
import { EmptyState, QueryBoundary } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { useDepartments } from '@/features/doctors/hooks';
import { departmentsApi } from '@/api/services';
import { toApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  name: z.string().trim().min(2, 'Department name is required'),
  description: z.string().trim().max(200, 'Keep it under 200 characters').optional(),
});
type Values = z.infer<typeof schema>;

export default function DepartmentsPage() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const qc = useQueryClient();
  const canCreate = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const q = useDepartments();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string }) => departmentsApi.create(input),
    onSuccess: (d) => { toast.success(`${d.name} department created.`); qc.invalidateQueries({ queryKey: ['departments'] }); reset(); setOpen(false); },
  });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try { await create.mutateAsync({ name: v.name, description: v.description || undefined }); }
    catch (e) { setFormError(toApiError(e).message); }
  });

  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments group doctors and filter the scheduler."
        actions={canCreate && <Button onClick={() => { setFormError(null); setOpen(true); }}><Plus className="h-4 w-4" aria-hidden /> Add department</Button>}
      />
      <Card>
        <QueryBoundary isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={!q.data?.items.length} onRetry={() => q.refetch()}
          empty={<EmptyState title="No departments yet" description="Create departments so doctors can be assigned to them."
            action={canCreate && <Button size="sm" onClick={() => setOpen(true)}>Add department</Button>} />}>
          <ul className="divide-y divide-line">
            {q.data?.items.map((d) => (
              <li key={d.id} className="px-5 py-3"><p className="font-medium">{d.name}</p>{d.description && <p className="text-sm text-muted">{d.description}</p>}</li>
            ))}
          </ul>
        </QueryBoundary>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add department">
        <form onSubmit={submit} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Name" required error={errors.name?.message} {...register('name')} />
          <TextField label="Description" error={errors.description?.message} {...register('description')} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Create</Button></div>
        </form>
      </Modal>
    </>
  );
}
