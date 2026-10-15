import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { patientsApi } from '@/api/services';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/stores/authStore';
import { canRegisterPatients } from '@/features/appointments/permissions';
import { QueryBoundary, EmptyState } from '@/components/ui/feedback';
import type { Patient } from '@/types';

interface Props {
  onSelect?: (p: Patient) => void;
  selectedId?: string;
  /** Called when the user chooses to register a new patient. Only offered to roles allowed to register. */
  onRegister?: () => void;
  autoFocus?: boolean;
}

const MIN_CHARS = 2;

/**
 * Search by patient ID, name or mobile. Input is debounced and the in-flight request is cancelled via
 * AbortSignal when the query changes.
 */
export function PatientSearch({ onSelect, selectedId, onRegister, autoFocus }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const canRegister = canRegisterPatients(role);
  const [term, setTerm] = useState('');
  const trimmed = term.trim();
  const debounced = useDebounce(trimmed, 350);
  const enabled = debounced.length >= MIN_CHARS;
  const pending = trimmed !== debounced && trimmed.length >= MIN_CHARS; // typed, not yet sent

  const q = useQuery({
    queryKey: ['patients', 'search', debounced],
    queryFn: ({ signal }) => patientsApi.search(debounced, signal),
    enabled,
  });
  const searching = pending || (enabled && q.isFetching);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          autoFocus={autoFocus}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search patients by patient ID, name or mobile number"
          placeholder="Search by patient ID, name or mobile…"
          className="field-input px-9"
        />
        {searching && (
          <span role="status" className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            <span className="sr-only">Searching…</span>
          </span>
        )}
      </div>

      <div className="mt-3" aria-live="polite" aria-busy={searching}>
        {!enabled ? (
          <p className="px-1 text-sm text-muted">Type at least {MIN_CHARS} characters of a patient ID, name or mobile number.</p>
        ) : (
          <div className={pending ? 'opacity-60 transition-opacity' : undefined}>
            <QueryBoundary
              isLoading={q.isLoading}
              isError={q.isError}
              error={q.error}
              isEmpty={!q.data?.items.length}
              onRetry={() => q.refetch()}
              empty={
                <EmptyState
                  title="No patients found"
                  description={canRegister ? `Nothing matches “${debounced}”. You can register them as a new patient.` : `Nothing matches “${debounced}”. Ask a receptionist to register this patient.`}
                  action={canRegister && onRegister ? (
                    <button type="button" onClick={onRegister} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover">
                      <UserPlus className="h-4 w-4" aria-hidden /> Register new patient
                    </button>
                  ) : undefined}
                />
              }
            >
              <ul className="divide-y divide-line rounded-lg border border-line">
                {q.data?.items.map((p) => {
                  const selected = p.id === selectedId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onSelect?.(p)}
                        disabled={!onSelect}
                        aria-pressed={onSelect ? selected : undefined}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${selected ? 'bg-soft' : 'hover:bg-soft/50'} disabled:cursor-default`}
                      >
                        <span>
                          <span className="block font-medium">{p.name}</span>
                          <span className="block text-xs text-muted">{[p.patientCode && `ID ${p.patientCode}`, p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}</span>
                        </span>
                        {selected && <span className="text-xs font-semibold text-primary">Selected</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </QueryBoundary>
          </div>
        )}
      </div>
    </div>
  );
}
