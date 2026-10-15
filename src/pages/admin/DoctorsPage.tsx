import { useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Layout';
import { EmptyState, QueryBoundary } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { DoctorFormModal } from '@/features/doctors/DoctorFormModal';
import { useDepartments, useDoctors } from '@/features/doctors/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@tanstack/react-query';
import { doctorsApi } from '@/api/services';
import type { Doctor } from '@/types';

export default function DoctorsPage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; doctor: Doctor | null }>({ open: false, doctor: null });
  const [detailId, setDetailId] = useState<string | null>(null);

  const debounced = useDebounce(search.trim(), 350);
  const depts = useDepartments();
  const q = useDoctors({ search: debounced || undefined, departmentId: departmentId || undefined, page, limit: 10 });
  const totalPages = q.data?.meta.totalPages ?? 1;

  const detail = useQuery({
    queryKey: ['doctors', 'detail', detailId],
    queryFn: () => doctorsApi.get(detailId!),
    enabled: !!detailId,
  });

  return (
    <>
      <PageHeader
        title="Doctors"
        description="Manage doctor accounts, specializations and departments."
        actions={<Button onClick={() => setForm({ open: true, doctor: null })}><Plus className="h-4 w-4" aria-hidden /> Add doctor</Button>}
      />

      <Card
        actions={
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input type="search" aria-label="Search doctors" placeholder="Search by name or specialization…" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="field-input h-9 pl-9" />
            </div>
            <select aria-label="Filter by department" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }} className="field-input h-9 w-auto py-1">
              <option value="">All departments</option>
              {depts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        }
      >
        <QueryBoundary isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={!q.data?.items.length} onRetry={() => q.refetch()}
          empty={<EmptyState title="No doctors found" description={debounced || departmentId ? 'Try changing your search or filter.' : 'Add the first doctor to get started.'} />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Doctors</caption>
              <thead className="bg-soft/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Name</th>
                  <th scope="col" className="px-5 py-3 font-medium">Specialization</th>
                  <th scope="col" className="px-5 py-3 font-medium">Department</th>
                  <th scope="col" className="px-5 py-3 font-medium">Contact</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data?.items.map((d) => (
                  <tr key={d.id} className="hover:bg-soft/40">
                    <td className="px-5 py-3 font-medium">
                      <button className="text-left text-primary hover:text-primary-hover hover:underline" onClick={() => setDetailId(d.id)}>{d.name}</button>
                    </td>
                    <td className="px-5 py-3">{d.specialization}</td>
                    <td className="px-5 py-3">{d.department?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">{d.email}</td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="secondary" aria-label={`Edit ${d.name}`} onClick={() => setForm({ open: true, doctor: d })}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-muted">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </QueryBoundary>
      </Card>

      <DoctorFormModal open={form.open} doctor={form.doctor} onClose={() => setForm({ open: false, doctor: null })} />

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="Doctor details">
        <QueryBoundary isLoading={detail.isLoading} isError={detail.isError} error={detail.error} isEmpty={!detail.data} onRetry={() => detail.refetch()} empty={null}>
          {detail.data && (
            <>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row k="Name" v={detail.data.name} />
                <Row k="Email" v={detail.data.email} />
                <Row k="Room" v={detail.data.room} />
                <Row k="Specialization" v={detail.data.specialization} />
                <Row k="Department" v={detail.data.department?.name} />
              </dl>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => { const d = detail.data!; setDetailId(null); setForm({ open: true, doctor: d }); }}>Edit doctor</Button>
              </div>
            </>
          )}
        </QueryBoundary>
      </Modal>
    </>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return <div><dt className="text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v || '—'}</dd></div>;
}
