import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from 'lucide-react';
import type { Appointment } from '@/types';
import type { AppointmentSortKey } from '@/api/services';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatTime } from '@/utils/format';
import { availableActions } from './permissions';
import { useUpdateStatus, type ForwardStatus } from './hooks';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';
import { CancelDialog } from './CancelDialog';

export interface SortState {
  sortBy: AppointmentSortKey;
  sortOrder: 'asc' | 'desc';
}

interface Props {
  items: Appointment[];
  showDoctor?: boolean;
  /** Show the role's valid status actions (mark arrived / complete / cancel) on each row. */
  manage?: boolean;
  /** Provide both to make the Time and Status headers sortable (server-side; the backend allow-lists these). */
  sort?: SortState;
  onSort?: (key: AppointmentSortKey) => void;
}

export function AppointmentTable({ items, showDoctor = true, manage, sort, onSort }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const update = useUpdateStatus();
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);

  const requestCancel = (a: Appointment) => {
    setDetail(null); // one dialog at a time keeps focus handling simple
    setCancelTarget(a);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Appointments</caption>
          <thead className="bg-soft/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <SortTh label="Time" k="scheduledAt" sort={sort} onSort={onSort} />
              <th scope="col" className="px-5 py-3 font-medium">Patient</th>
              {showDoctor && <th scope="col" className="px-5 py-3 font-medium">Doctor</th>}
              <th scope="col" className="px-5 py-3 font-medium">Purpose</th>
              <SortTh label="Status" k="status" sort={sort} onSort={onSort} />
              <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((a) => {
              const actions = manage ? availableActions(role, a.status) : [];
              const busy = update.isPending && update.variables?.id === a.id;
              return (
                <tr key={a.id} className="hover:bg-soft/40">
                  <td className="whitespace-nowrap px-5 py-3">
                    <p className="font-medium">{formatTime(a.scheduledAt)}</p>
                    <p className="text-xs text-muted">{formatDate(a.scheduledAt)}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{a.patient?.name ?? '—'}</p>
                    <p className="text-xs text-muted">{[a.patient?.patientCode && `ID ${a.patient.patientCode}`, a.patient?.phone].filter(Boolean).join(' · ')}</p>
                  </td>
                  {showDoctor && (
                    <td className="px-5 py-3">
                      <p>{a.doctor?.name ?? '—'}</p>
                      {a.doctor?.specialization && <p className="text-xs text-muted">{a.doctor.specialization}</p>}
                    </td>
                  )}
                  <td className="max-w-[14rem] truncate px-5 py-3 text-muted" title={a.reason ?? undefined}>{a.reason || '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" aria-label={`View appointment for ${a.patient?.name ?? 'patient'}`} onClick={() => setDetail(a)}>
                        <Eye className="h-3.5 w-3.5" aria-hidden /> View
                      </Button>
                      {actions.map((x) => (
                        <Button
                          key={x.status}
                          size="sm"
                          variant={x.status === 'CANCELLED' ? 'secondary' : 'primary'}
                          loading={busy && update.variables?.status === x.status}
                          disabled={busy}
                          onClick={() => (x.status === 'CANCELLED' ? requestCancel(a) : update.mutate({ id: a.id, status: x.status as ForwardStatus }))}
                        >
                          {x.label}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AppointmentDetailsModal appointment={detail} onClose={() => setDetail(null)} onRequestCancel={requestCancel} />
      <CancelDialog appointment={cancelTarget} onClose={() => setCancelTarget(null)} />
    </>
  );
}

function SortTh({ label, k, sort, onSort }: { label: string; k: AppointmentSortKey; sort?: SortState; onSort?: (k: AppointmentSortKey) => void }) {
  if (!sort || !onSort) return <th scope="col" className="px-5 py-3 font-medium">{label}</th>;
  const active = sort.sortBy === k;
  const Icon = !active ? ArrowUpDown : sort.sortOrder === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-5 py-3 font-medium">
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink">
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'opacity-40'}`} aria-hidden />
      </button>
    </th>
  );
}
