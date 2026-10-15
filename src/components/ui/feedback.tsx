import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { toApiError } from '@/api/client';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-soft ${className}`} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="rounded-full bg-soft p-3 text-primary"><Inbox className="h-6 w-6" aria-hidden /></span>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message } = toApiError(error);
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="rounded-full bg-danger/10 p-3 text-danger"><AlertTriangle className="h-6 w-6" aria-hidden /></span>
      <p className="font-medium text-ink">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Renders loading / error / empty / content consistently for a query. */
export function QueryBoundary({
  isLoading, isError, error, isEmpty, onRetry, empty, children,
}: {
  isLoading: boolean; isError: boolean; error: unknown; isEmpty: boolean;
  onRetry?: () => void; empty: ReactNode; children: ReactNode;
}) {
  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
