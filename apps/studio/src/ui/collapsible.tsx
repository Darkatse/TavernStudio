/*
 * Adapted from shadcn/ui's Base UI collapsible (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/collapsible.tsx
 */
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { clsx } from 'clsx';

export const Collapsible = BaseCollapsible.Root;
/** Pass the button that folds the panel through `render`. */
export const CollapsibleTrigger = BaseCollapsible.Trigger;

export type CollapsiblePanelProps = Omit<BaseCollapsible.Panel.Props, 'className'> & {
  /** Layout only. */
  className?: string;
};

/** It stays mounted while closed, so what is inside keeps its state. */
export function CollapsiblePanel({
  keepMounted = true,
  className,
  ...props
}: CollapsiblePanelProps) {
  return (
    <BaseCollapsible.Panel
      keepMounted={keepMounted}
      className={clsx('motion-fold', className)}
      {...props}
    />
  );
}
