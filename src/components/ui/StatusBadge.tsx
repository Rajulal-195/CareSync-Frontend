import clsx from 'clsx';
import { CalendarClock, CheckCircle2, UserCheck, XCircle, type LucideIcon } from 'lucide-react';
import type { AppointmentStatus } from '@/types';

const CONFIG: Record<AppointmentStatus, { label: string; icon: LucideIcon; cls: string }> = {
  SCHEDULED: { label: 'Scheduled', icon: CalendarClock, cls: 'bg-soft text-forest border-sage' },
  ARRIVED: { label: 'Arrived', icon: UserCheck, cls: 'bg-warning/10 text-warning border-warning/30' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, cls: 'bg-success/10 text-success border-success/30' },
  CANCELLED: { label: 'Cancelled', icon: XCircle, cls: 'bg-danger/10 text-danger border-danger/30' },
};

/** Status is always conveyed by icon + text, never colour alone. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, icon: Icon, cls } = CONFIG[status];
  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', cls)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
