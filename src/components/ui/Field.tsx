import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

function FieldShell({ label, error, hint, required, children, className }: FieldShellProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-muted">{hint}</p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>
      )}
    </div>
  );
}

type BaseProps = { label: string; error?: string; hint?: string; wrapperClassName?: string };

export const TextField = forwardRef<HTMLInputElement, BaseProps & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, error, hint, wrapperClassName, className, required, ...rest }, ref) {
    return (
      <FieldShell label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
        {({ id, describedBy, invalid }) => (
          <input
            ref={ref}
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            required={required}
            className={clsx('field-input', className)}
            {...rest}
          />
        )}
      </FieldShell>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, BaseProps & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, error, hint, wrapperClassName, className, required, children, ...rest }, ref) {
    return (
      <FieldShell label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
        {({ id, describedBy, invalid }) => (
          <select
            ref={ref}
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={clsx('field-input pr-8', className)}
            {...rest}
          >
            {children}
          </select>
        )}
      </FieldShell>
    );
  },
);

export const TextAreaField = forwardRef<HTMLTextAreaElement, BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextAreaField({ label, error, hint, wrapperClassName, className, required, ...rest }, ref) {
    return (
      <FieldShell label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
        {({ id, describedBy, invalid }) => (
          <textarea
            ref={ref}
            id={id}
            rows={3}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={clsx('field-input', className)}
            {...rest}
          />
        )}
      </FieldShell>
    );
  },
);
