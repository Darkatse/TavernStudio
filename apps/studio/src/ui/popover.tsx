/*
 * Adapted from shadcn/ui's Base UI popover (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/popover.tsx
 */
import { Popover as BasePopover } from '@base-ui/react/popover';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export const Popover = BasePopover.Root;
/** Pass the button that opens the popover through `render`. */
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverTitle = BasePopover.Title;
/** Pass the button that closes the popover through `render`. */
export const PopoverClose = BasePopover.Close;

export interface PopoverContentProps {
  align?: BasePopover.Positioner.Props['align'];
  children: ReactNode;
  /** Layout only: the panel's size. */
  className?: string;
}

export function PopoverContent({ align = 'end', children, className }: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side="bottom" align={align} sideOffset={6} collisionPadding={8}>
        <BasePopover.Popup
          className={clsx(
            'max-h-(--available-height) motion-popup overflow-y-auto overscroll-contain rounded-2xl bg-raised shadow-popover motion-slow outline-none',
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
