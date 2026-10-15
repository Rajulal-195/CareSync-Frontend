import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/stores/toastStore';

const STYLE: Record<ToastKind, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'border-success/40 text-success', Icon: CheckCircle2 },
  error: { cls: 'border-danger/40 text-danger', Icon: AlertCircle },
  info: { cls: 'border-sage text-primary', Icon: Info },
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const { cls, Icon } = STYLE[t.kind];
        return (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`card flex items-start gap-3 border p-3 shadow-pop ${cls}`}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="flex-1 text-sm text-ink">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="text-muted hover:text-ink">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
