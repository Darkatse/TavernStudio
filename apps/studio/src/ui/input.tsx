import { clsx } from 'clsx';
import { useId, type ComponentProps, type ReactNode } from 'react';

export type InputProps = Omit<ComponentProps<'input'>, 'className'> & {
  /** Layout only. */
  className?: string;
};

/** A one-line field, the height of every control (docs/UI.md §3, density). */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        'h-(--size-control) w-full min-w-0 rounded-md bg-surface px-3 shadow-control transition-shadow motion-fast outline-none placeholder:text-muted focus-visible:shadow-focus disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

/** A labelled field: the label above, a hint or an error below. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-pretty text-muted">{hint}</p>
      )}
    </div>
  );
}
