import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState, QueryBoundary } from '@/components/ui/feedback';
import { useDebounce } from '@/hooks/useDebounce';
import { useDepartments, useDoctors } from '@/features/doctors/hooks';
import type { AppointmentSortKey } from '@/api/services';
import type { AppointmentStatus } from '@/types';
import { AppointmentTable, type SortState } from './AppointmentTable';
import { useAppointments } from './hooks';
import { pageInfo } from './paging';

const STATUSES: (AppointmentStatus | '')[] = ['', 'SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED'];
const PAGE_SIZES = [10, 25, 50];
const DEFAULT_SORT: SortState = { sortBy: 'scheduledAt', sortOrder: 'desc' };

/**
 * Appointments list shared by all roles. Search, filters, sorting and pagination are all server-side:
 * the page never filters or sorts a partial result set itself.
 * `scope="mine"` is the doctor's own list (the backend pins doctors to their own appointments), so the
 * department and doctor filters are only offered for `scope="all"`.
 */
export function AppointmentList({ scope = 'all', manage, showDoctor = true }: { scope?: 'all' | 'mine'; manage?: boolean; showDoctor?: boolean }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [departmentId, setDepartmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const debouncedSearch = useDebounce(search.trim(), 350);
  const depts = useDepartments();
  const doctors = useDoctors({ departmentId: departmentId || undefined, limit: 100 }, scope === 'all');
  const rangeInvalid = !!from && !!to && from > to;

  const q = useAppointments(
    {
      search: debouncedSearch || undefined,
      status: status || undefined,
      departmentId: departmentId || undefined,
      doctorId: doctorId || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      limit,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    },
    scope,
    !rangeInvalid,
  );

  const items = q.data?.items ?? [];
  const info = pageInfo(q.data?.meta, page, limit, items.length);
  const filtered = !!(debouncedSearch || status || departmentId || doctorId || from || to);

  // If filters shrink the result set below the current page, step back to the last real page.
  useEffect(() => {
    if (info.totalPages !== null && page > info.totalPages) setPage(info.totalPages);
  }, [info.totalPages, page]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const onSort = (key: AppointmentSortKey) => {
    setSort((s) =>
      s.sortBy === key
        ? { sortBy: key, sortOrder: s.sortOrder === 'asc' ? 'desc' : 'asc' }
        : { sortBy: key, sortOrder: key === 'scheduledAt' ? 'desc' : 'asc' },
    );
    setPage(1);
  };
  const clearFilters = () => {
    setSearch(''); setStatus(''); setDepartmentId(''); setDoctorId(''); setFrom(''); setTo(''); setPage(1);
  };

  return (
    <Card title="Appointments" actions={q.isFetching && !q.isLoading ? <span role="status" className="text-xs text-muted">Updating…</span> : undefined}>
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-7">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            aria-label="Search by patient name, patient ID or mobile"
            placeholder="Patient name, ID or mobile (2+ characters)…"
            className="field-input pl-9"
          />
        </div>

        <select aria-label="Filter by status" className="field-input" value={status} onChange={(e) => reset(setStatus)(e.target.value as AppointmentStatus | '')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s[0] + s.slice(1).toLowerCase() : 'All statuses'}</option>)}
        </select>

        {scope === 'all' && (
          <select aria-label="Filter by department" className="field-input" value={departmentId} onChange={(e) => { setDoctorId(''); reset(setDepartmentId)(e.target.value); }} disabled={depts.isLoading}>
            <option value="">All departments</option>
            {depts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}

        {scope === 'all' && (
          <select aria-label="Filter by doctor" className="field-input" value={doctorId} onChange={(e) => reset(setDoctorId)(e.target.value)} disabled={doctors.isLoading}>
            <option value="">All doctors</option>
            {doctors.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}

        <label className="flex items-center gap-2 text-xs text-muted">
          From
          <input type="date" className="field-input" max={to || undefined} value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          To
          <input type="date" className="field-input" min={from || undefined} value={to} onChange={(e) => reset(setTo)(e.target.value)} />
        </label>

        {(filtered || search) && (
          <div className="sm:col-span-2 lg:col-span-7">
            <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
          </div>
        )}
        {rangeInvalid && (
          <p role="alert" className="text-sm font-medium text-danger sm:col-span-2 lg:col-span-7">The start date must be on or before the end date.</p>
        )}
      </div>

      {rangeInvalid ? null : (
        <div aria-busy={q.isFetching}>
          <QueryBoundary
            isLoading={q.isLoading} isError={q.isError} error={q.error}
            isEmpty={!items.length} onRetry={() => q.refetch()}
            empty={
              <EmptyState
                title={filtered ? 'No appointments match your filters' : 'No appointments yet'}
                description={filtered ? 'Try a different search or clear the filters.' : undefined}
                action={filtered ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            }
          >
            <AppointmentTable items={items} manage={manage} showDoctor={showDoctor} sort={sort} onSort={onSort} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
              <span className="text-muted" aria-live="polite">
                {info.total !== null ? `Showing ${info.from}–${info.to} of ${info.total}` : `Showing ${info.from}–${info.to}`}
                {info.totalPages !== null && ` · Page ${page} of ${info.totalPages}`}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted">
                  Rows
                  <select className="field-input h-8 w-auto py-0" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <Button size="sm" variant="secondary" disabled={!info.hasPrev} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={!info.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </QueryBoundary>
        </div>
      )}
    </Card>
  );
}
