import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, icon: Icon, loading }: { label: string; value?: number; icon: LucideIcon; loading?: boolean }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className="rounded-lg bg-soft p-2.5 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{loading ? '…' : value ?? '—'}</p>
      </div>
    </div>
  );
}
