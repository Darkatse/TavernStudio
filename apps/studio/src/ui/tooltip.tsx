import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

export const TooltipProvider = BaseTooltip.Provider;

export interface TooltipProps {
  content: ReactNode;
  side?: BaseTooltip.Positioner.Props['side'];
  /** The trigger. It receives the tooltip's props and ref. */
  children: ReactElement;
}

export function Tooltip({ content, side = 'bottom', children }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6}>
          <BaseTooltip.Popup className="motion-popup rounded-md bg-primary px-2 py-1 text-caption text-primary-fg shadow-popover motion-fast">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
