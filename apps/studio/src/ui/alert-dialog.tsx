/*
 * Adapted from shadcn/ui's Base UI alert dialog (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/alert-dialog.tsx
 *
 * Changed for docs/UI.md: the parts are folded into one content component
 * that requires a named action, keeps it out of red and gives the affected
 * items a place; motion is the slow tier.
 */
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import type { ReactNode } from 'react';
import { Button } from './button';

export const AlertDialog = BaseAlertDialog.Root;
/** Pass the button that opens the dialog through `render`. */
export const AlertDialogTrigger = BaseAlertDialog.Trigger;

export interface AlertDialogContentProps {
  title: string;
  description?: string;
  /** What the action will affect, for example the files a rollback changes. */
  children?: ReactNode;
  /** The action, named for what it does: "回滚到此处", "丢弃". */
  action: string;
  onAction: () => void;
  cancel?: string;
}

/**
 * Confirms a destructive action (docs/UI.md §5). The action is not red, since
 * red only means an error. Focus starts on cancel, the safe choice, and goes
 * back to the trigger when the dialog closes.
 */
export function AlertDialogContent({
  title,
  description,
  children,
  action,
  onAction,
  cancel = '取消',
}: AlertDialogContentProps) {
  return (
    <BaseAlertDialog.Portal>
      {/* iOS Safari: a fixed backdrop leaves a gap under the collapsing toolbar. */}
      <BaseAlertDialog.Backdrop className="fixed inset-0 min-h-dvh bg-backdrop transition-opacity motion-slow data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
      <BaseAlertDialog.Viewport className="fixed inset-0 grid place-items-center p-4 data-ending-style:pointer-events-none">
        <BaseAlertDialog.Popup className="flex w-full max-w-100 motion-popup flex-col gap-4 rounded-2xl bg-raised p-5 shadow-popover motion-slow outline-none">
          <div className="flex flex-col gap-1.5">
            <BaseAlertDialog.Title className="text-title">{title}</BaseAlertDialog.Title>
            {description && (
              <BaseAlertDialog.Description className="text-pretty text-muted">
                {description}
              </BaseAlertDialog.Description>
            )}
          </div>
          {children && (
            <div className="max-h-60 overflow-y-auto rounded-lg bg-sunken px-3 py-2">
              {children}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <BaseAlertDialog.Close render={<Button />}>{cancel}</BaseAlertDialog.Close>
            <BaseAlertDialog.Close render={<Button variant="primary" />} onClick={onAction}>
              {action}
            </BaseAlertDialog.Close>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Viewport>
    </BaseAlertDialog.Portal>
  );
}
