/*
 * Adapted from shadcn/ui's Base UI dialog (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dialog.tsx
 *
 * Anchored near the top, so a dialog whose content changes does not jump.
 */
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { Button } from './button';

export const Dialog = BaseDialog.Root;
/** Pass the button that opens the dialog through `render`. */
export const DialogTrigger = BaseDialog.Trigger;

export interface DialogContentProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = 'md',
}: DialogContentProps) {
  const { close } = useMessages(common);
  return (
    <BaseDialog.Portal>
      {/* iOS Safari: a fixed backdrop leaves a gap under the collapsing toolbar. */}
      <BaseDialog.Backdrop className="fixed inset-0 min-h-dvh bg-backdrop transition-opacity motion-slow data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
      <BaseDialog.Viewport className="fixed inset-0 flex justify-center overflow-y-auto p-4 pt-(--dialog-top) data-ending-style:pointer-events-none">
        <BaseDialog.Popup
          className={clsx(
            'flex h-fit w-full motion-popup flex-col rounded-2xl bg-raised shadow-popover motion-slow outline-none',
            size === 'md' ? 'max-w-100' : 'max-w-135',
          )}
        >
          <header className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="flex flex-col gap-1.5">
              <BaseDialog.Title className="text-title">{title}</BaseDialog.Title>
              {description && (
                <BaseDialog.Description className="text-pretty text-muted">
                  {description}
                </BaseDialog.Description>
              )}
            </div>
            <BaseDialog.Close render={<Button variant="ghost" icon aria-label={close} />}>
              <X />
            </BaseDialog.Close>
          </header>
          <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 px-5 pb-5">{footer}</footer>}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}
