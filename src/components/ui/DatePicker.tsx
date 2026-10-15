import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toISODate } from '@/utils/format';

interface Props {
  /** YYYY-MM-DD */
  value: string;
  onChange: (iso: string) => void;
  /** earliest selectable date, YYYY-MM-DD */
  min?: string;
  label?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Lightweight accessible month-grid calendar (no external date library). */
export function DatePicker({ value, onChange, min, label = 'Select date' }: Props) {
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [view, setView] = useState(() => {
    const d = selected ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= days; d++) out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  const todayIso = toISODate(new Date());
  const monthLabel = view.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  return (
    <div role="group" aria-label={label} className="w-full max-w-xs rounded-xl2 border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-soft hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span aria-live="polite" className="text-sm font-semibold">{monthLabel}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-soft hover:text-ink">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const iso = toISODate(d);
          const disabled = !!min && iso < min;
          const isSelected = iso === value;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              aria-pressed={isSelected}
              aria-label={d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              className={clsx(
                'h-8 rounded-md text-sm transition-colors',
                isSelected ? 'bg-primary font-semibold text-primary-fg' : 'text-ink hover:bg-soft',
                iso === todayIso && !isSelected && 'border border-sage',
                disabled && 'cursor-not-allowed text-muted/40 hover:bg-transparent',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
