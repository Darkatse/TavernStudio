import { clsx } from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';

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
 *
 * Put it where the name was. Its text stays there, the field's edge reaching
 * left of it by the field's padding, and only the edge fades in.
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
    <span className={clsx('relative -ml-1.5 flex min-w-0', className)}>
      <span className="relative isolate flex min-w-0 flex-1">
        <input
          ref={input}
          value={naming.value}
          aria-label={label}
          aria-invalid={naming.problem !== undefined}
          aria-describedby={naming.problem ? problemId : undefined}
          spellCheck={false}
          autoComplete="off"
          className="peer h-[calc(var(--size-control)-6px)] min-w-0 flex-1 bg-transparent px-1.5 outline-none focus-visible:outline-none"
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
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-sm bg-surface shadow-control transition-opacity motion-moderate peer-aria-invalid:shadow-[0_0_0_1px_var(--color-danger)] starting:opacity-0"
        />
      </span>
      {naming.problem && (
        <span
          id={problemId}
          role="alert"
          // A panel may clip anything wider than the field.
          className="absolute top-full left-0 z-20 mt-1 flex w-max max-w-full items-start gap-1.5 rounded-md bg-raised px-2 py-1.5 text-caption shadow-popover transition-opacity motion-fast starting:opacity-0"
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0 text-danger" />
          {naming.problem}
        </span>
      )}
    </span>
  );
}

export interface Renaming<Problem> {
  /** The name being typed; undefined when nothing is renamed. */
  draft: string | undefined;
  /** For the menu's `finalFocus`: the field takes focus when renaming starts. */
  returnsFocus: () => boolean;
  start: (name: string) => void;
  /** For the field while renaming; the caller words the problem. */
  field: (Omit<Naming, 'problem'> & { problem: Problem | undefined }) | undefined;
}

/**
 * Renaming in place from a menu. The field lies over the menu's trigger until
 * the new name is stored, so the old name never shows in between, or until
 * the renaming is cancelled; then focus goes back to the trigger, unless it
 * has moved on elsewhere.
 */
export function useRenaming<Problem>({
  trigger,
  check,
  commit,
}: {
  trigger: RefObject<HTMLElement | null>;
  check: (name: string) => Problem | undefined;
  commit: (name: string) => Promise<void> | void;
}): Renaming<Problem> {
  const [naming, setNaming] = useState<{ value: string; problem?: Problem }>();
  // From choosing Rename until the name is committed or cancelled: the menu
  // closing meanwhile hands focus to nothing, and a blur after that is ignored.
  const renaming = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (naming || !refocus.current) return;
    refocus.current = false;
    if (document.activeElement === document.body) trigger.current?.focus();
  }, [naming, trigger]);

  const stop = () => {
    renaming.current = false;
    refocus.current = true;
    setNaming(undefined);
  };
  const finish = async (value: string) => {
    if (!renaming.current) return;
    const problem = check(value);
    if (problem !== undefined) {
      setNaming({ value, problem });
      return;
    }
    renaming.current = false;
    await commit(value);
    stop();
  };

  return {
    draft: naming?.value,
    returnsFocus: () => !renaming.current,
    start: (name) => {
      renaming.current = true;
      setNaming({ value: name });
    },
    field: naming && {
      value: naming.value,
      problem: naming.problem,
      onChange: (value) => setNaming({ value }),
      onCommit: () => void finish(naming.value),
      onCancel: () => {
        if (renaming.current) stop();
      },
    },
  };
}
