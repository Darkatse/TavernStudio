import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-sunken text-muted shadow-[inset_0_0_0_1px_var(--color-line)] [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex max-w-72 flex-col gap-1">
        <h2 className="text-subtitle">{title}</h2>
        {description && <p className="text-pretty text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
