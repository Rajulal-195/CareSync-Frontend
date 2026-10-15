import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

export type AlertTone = 'error' | 'warning' | 'success' | 'info';

const TONES: Record<AlertTone, { cls: string; icon: LucideIcon }> = {
  error: { cls: 'border-danger/30 bg-danger/10 text-danger', icon: AlertCircle },
  warning: { cls: 'border-warning/40 bg-warning/10 text-warning', icon: AlertTriangle },
  success: { cls: 'border-success/30 bg-success/10 text-success', icon: CheckCircle2 },
  info: { cls: 'border-sage bg-soft text-forest', icon: Info },
};

/** Inline message. Always pairs an icon with text, so meaning never depends on colour alone. */
export function Alert({ tone = 'error', children, className }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  const { cls, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={clsx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', cls, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
