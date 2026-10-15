import { Activity, CalendarCheck, CalendarClock, CheckCircle2, Stethoscope, UserCheck, UserCog, Users, XCircle, type LucideIcon } from 'lucide-react';
import { Card, PageHeader, StatCard } from '@/components/ui/Layout';
import { EmptyState, ErrorState, QueryBoundary, Skeleton } from '@/components/ui/feedback';
import { AppointmentTable } from '@/features/appointments/AppointmentTable';
import { useAppointments, useDashboardStats } from '@/features/appointments/hooks';
import { STATUS_METRICS, type Metric } from '@/features/dashboard/stats';

const ICONS: Record<string, LucideIcon> = {
  doctors: Stethoscope,
  receptionists: UserCog,
  patients: Users,
  today: CalendarCheck,
  scheduled: CalendarClock,
  arrived: UserCheck,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const BAR_CLASS: Record<string, string> = {
  scheduled: 'bg-sage',
  arrived: 'bg-warning',
  completed: 'bg-primary',
  cancelled: 'bg-danger',
};

/**
 * Every figure here comes from GET /dashboard/stats. The widgets shown adapt to the metrics the
 * response actually contains; nothing is calculated from the paged appointment list below.
 */
export default function AdminDashboard() {
  const stats = useDashboardStats();
  // Not a metric: just the most recent rows for the activity table.
  const recent = useAppointments({ limit: 8, sortBy: 'scheduledAt', sortOrder: 'desc' });

  const s = stats.data;
  const bars = s ? STATUS_METRICS.map((m) => s.known.find((k) => k.id === m.id)).filter((m): m is Metric => !!m) : [];
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <>
      <PageHeader title="Dashboard" description="Hospital-wide overview." />

      {stats.isLoading ? (
        <div role="status" aria-label="Loading statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[4.5rem]" />)}
        </div>
      ) : stats.isError ? (
        <Card><ErrorState error={stats.error} onRetry={() => stats.refetch()} /></Card>
      ) : s?.isEmpty ? (
        <Card><EmptyState title="No statistics available" description="The server returned no metrics for the dashboard." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {s?.known.map((m) => <StatCard key={m.id} label={m.label} value={m.value} icon={ICONS[m.id] ?? Activity} />)}
          {s?.extras.map((m) => <StatCard key={m.id} label={m.label} value={m.value} icon={Activity} />)}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {bars.length > 0 && (
          <Card title="Appointments by status" className="xl:col-span-1">
            <div className="space-y-4 p-5">
              {bars.map((b) => (
                <div key={b.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{b.label}</span><span className="font-semibold tabular-nums">{b.value}</span></div>
                  <div className="h-2.5 rounded-full bg-soft" role="img" aria-label={`${b.label}: ${b.value}`}>
                    <div className={`h-full rounded-full ${BAR_CLASS[b.id] ?? 'bg-primary'}`} style={{ width: `${(b.value / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title="Recent appointment activity" className={bars.length > 0 ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <QueryBoundary
            isLoading={recent.isLoading} isError={recent.isError} error={recent.error}
            isEmpty={!recent.data?.items.length} onRetry={() => recent.refetch()}
            empty={<EmptyState title="No recent activity" />}
          >
            <AppointmentTable items={recent.data?.items ?? []} />
          </QueryBoundary>
        </Card>
      </div>
    </>
  );
}
