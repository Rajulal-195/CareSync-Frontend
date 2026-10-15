import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Lock } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { formatTime } from '@/utils/format';
import { useSlots } from './hooks';
import type { Slot } from '@/types';

interface Props {
  doctorId?: string;
  date: string;
  selected: string;
  onSelect: (slotStart: string) => void;
}

type View = 'available' | 'selected' | 'booked' | 'unavailable' | 'past';

/**
 * Renders backend-provided slots. Past slots are disabled client-side as a convenience only;
 * the backend decides what is bookable (and rejects the rest).
 */
export function SlotGrid({ doctorId, date, selected, onSelect }: Props) {
  const q = useSlots(doctorId, date);
  const [now, setNow] = useState(() => Date.now());
  const [lostNotice, setLostNotice] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // If a live update makes the chosen slot unavailable, drop the selection and say so.
  useEffect(() => {
    if (!selected || !q.data || q.isFetching) return;
    const current = q.data.find((s) => s.start === selected);
    if (!current || current.status !== 'AVAILABLE') {
      onSelect('');
      setLostNotice(true);
    }
  }, [q.data, q.isFetching, selected, onSelect]);

  useEffect(() => { if (selected) setLostNotice(false); }, [selected]);

  if (!doctorId) return <EmptyState title="Select a doctor" description="Available times appear here once a doctor is chosen." />;
  if (q.isLoading) {
    return (
      <div role="status" aria-label="Loading slots" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) {
    return <EmptyState title="No slots on this date" description="The doctor isn’t scheduled that day, or the schedule is disabled. Try another date." />;
  }

  const viewOf = (s: Slot): View => {
    if (s.status === 'BOOKED') return 'booked';
    if (s.status === 'UNAVAILABLE') return 'unavailable';
    if (new Date(s.start).getTime() <= now) return 'past';
    return s.start === selected ? 'selected' : 'available';
  };

  const counts = q.data.filter((s) => viewOf(s) === 'available' || viewOf(s) === 'selected').length;

  return (
    <div>
      {lostNotice && (
        <div role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          The time you picked is no longer available. Please choose another slot.
        </div>
      )}
      <p className="sr-only" aria-live="polite">{counts} slots available</p>

      <div role="group" aria-label="Time slots" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {q.data.map((s) => {
          const v = viewOf(s);
          const clickable = v === 'available' || v === 'selected';
          return (
            <button
              key={s.start}
              type="button"
              disabled={!clickable}
              aria-pressed={v === 'selected'}
              onClick={() => onSelect(s.start)}
              className={clsx(
                'flex h-11 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                v === 'available' && 'border-line bg-surface text-ink hover:border-primary hover:bg-soft',
                v === 'selected' && 'border-primary bg-primary text-primary-fg',
                v === 'booked' && 'cursor-not-allowed border-line bg-soft/60 text-muted line-through decoration-muted/60',
                (v === 'unavailable' || v === 'past') && 'cursor-not-allowed border-dashed border-line bg-transparent text-muted/70',
              )}
            >
              <span className="flex items-center gap-1">
                {v === 'selected' && <Check className="h-3.5 w-3.5" aria-hidden />}
                {v === 'booked' && <Lock className="h-3 w-3" aria-hidden />}
                {formatTime(s.start)}
              </span>
              {v !== 'available' && v !== 'selected' && (
                <span className="text-[10px] font-normal uppercase tracking-wide no-underline">
                  {v === 'booked' ? 'Booked' : v === 'past' ? 'Past' : 'Unavailable'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ul aria-label="Legend" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-surface" /> Available</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary" /> Selected</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-soft" /> Booked</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-line" /> Unavailable / past</li>
      </ul>
    </div>
  );
}
