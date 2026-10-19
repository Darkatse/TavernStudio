import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export interface AlertProps {
  /**
   * `error`: something failed. It is announced at once and its icon is red,
   * the one place red goes (docs/UI.md §3). `notice`: something needs a
   * decision, but nothing failed.
   */
  kind?: 'notice' | 'error';
  icon: ReactNode;
  title: string;
  /** What the decision is about, or the error's original text. */
  children?: ReactNode;
  /** Buttons named for what they do: "Retry", "Load new version". */
  actions?: ReactNode;
}

/**
 * A message where the problem is (docs/UI.md §5). It stays until what it
 * reports is settled, unlike a toast.
 */
export function Alert({ kind = 'notice', icon, title, children, actions }: AlertProps) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      data-density="compact"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-sunken py-1.5 pr-1.5 pl-3 shadow-[inset_0_0_0_1px_var(--color-line)]"
    >
      <span
        className={clsx(
          'flex min-w-0 flex-1 items-start gap-2.5 py-1 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
          kind === 'error' ? '[&>svg]:text-danger' : '[&>svg]:text-muted',
        )}
      >
        {icon}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{title}</span>
          {children && <span className="break-words text-muted">{children}</span>}
        </span>
      </span>
      {actions && <span className="ml-auto flex shrink-0 gap-1.5">{actions}</span>}
    </div>
  );
}
