import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Layout';
import { EmptyState, QueryBoundary } from '@/components/ui/feedback';
import { ReceptionistFormModal } from '@/features/receptionists/ReceptionistFormModal';
import { receptionistsApi } from '@/api/services';
import { useAuthStore } from '@/stores/authStore';

export default function ReceptionistsPage() {
  const [open, setOpen] = useState(false);
  // Route is already Super Admin-only; this keeps the control honest if the page is ever reused.
  const canCreate = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const q = useQuery({ queryKey: ['receptionists'], queryFn: ({ signal }) => receptionistsApi.list({}, signal) });

  return (
    <>
      <PageHeader
        title="Receptionists"
        description="Front-desk staff accounts."
        actions={canCreate && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add receptionist</Button>}
      />
      <Card>
        <QueryBoundary isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={!q.data?.items.length} onRetry={() => q.refetch()}
          empty={<EmptyState title="No receptionists yet" description="Add a receptionist so front-desk staff can book appointments."
            action={canCreate && <Button size="sm" onClick={() => setOpen(true)}>Add receptionist</Button>} />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="sr-only">Receptionists</caption>
              <thead className="bg-soft/60 text-xs uppercase tracking-wide text-muted">
                <tr><th scope="col" className="px-5 py-3 font-medium">Name</th><th scope="col" className="px-5 py-3 font-medium">Email</th><th scope="col" className="px-5 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data?.items.map((r) => (
                  <tr key={r.id}><td className="px-5 py-3 font-medium">{r.name}</td><td className="px-5 py-3 text-muted">{r.email}</td><td className="px-5 py-3 text-muted">{r.isActive === false ? 'Inactive' : 'Active'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryBoundary>
      </Card>
      {canCreate && <ReceptionistFormModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
