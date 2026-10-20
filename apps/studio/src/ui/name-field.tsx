import { clsx } from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export interface Naming {
  value: string;
  problem: string | undefined;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export interface NameFieldProps {
  naming: Naming;
  label: string;
  /** Selects the name up to its extension, as for a file. */
  stem?: boolean;
  /** Layout only. */
  className?: string;
}

/**
 * Renaming in place: Enter commits and Escape cancels; leaving the field
 * commits, unless the name has a problem or is empty.
 */
export function NameField({ naming, label, stem = false, className }: NameFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const problemId = useId();
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    const dot = stem ? field.value.lastIndexOf('.') : -1;
    field.setSelectionRange(0, dot > 0 ? dot : field.value.length);
  }, [stem]);

  return (
    <span className={clsx('relative flex min-w-0', className)}>
      <input
        ref={input}
        value={naming.value}
        aria-label={label}
        aria-invalid={naming.problem !== undefined}
        aria-describedby={naming.problem ? problemId : undefined}
        spellCheck={false}
        autoComplete="off"
        className="h-[calc(var(--size-control)-6px)] min-w-0 flex-1 rounded-sm bg-surface px-1.5 shadow-control outline-none focus-visible:outline-none aria-invalid:shadow-[0_0_0_1px_var(--color-danger)]"
        onChange={(event) => naming.onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            naming.onCommit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            naming.onCancel();
          }
        }}
        onBlur={() =>
          naming.problem || naming.value.trim() === '' ? naming.onCancel() : naming.onCommit()
        }
      />
      {naming.problem && (
        <span
          id={problemId}
          role="alert"
          // A panel may clip anything wider than the field.
          className="absolute top-full left-0 z-20 mt-1 flex w-max max-w-full items-start gap-1.5 rounded-md bg-raised px-2 py-1.5 text-caption shadow-popover"
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0 text-danger" />
          {naming.problem}
        </span>
      )}
    </span>
  );
}
