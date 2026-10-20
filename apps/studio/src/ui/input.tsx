import { clsx } from 'clsx';
import { useId, type ComponentProps, type ReactNode } from 'react';

export type InputProps = Omit<ComponentProps<'input'>, 'className'> & {
  /** Layout only. */
  className?: string;
};

/** What a text field and a select's trigger look like. */
export const fieldSurface =
  'h-(--size-control) w-full min-w-0 rounded-md bg-surface px-3 shadow-control transition-shadow motion-fast outline-none focus-visible:shadow-focus disabled:opacity-45';

/** Numbers go without spin buttons: Studio's are counts typed whole, not stepped. */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        fieldSurface,
        '[appearance:textfield] placeholder:text-muted [&::-webkit-inner-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  );
}

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
