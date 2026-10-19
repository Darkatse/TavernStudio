/*
 * Adapted from shadcn/ui's Base UI toast (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/toast.tsx
 *
 * The stack stays spread out instead of collapsing into a pile, because the
 * pile animates height.
 */
import { Toast as BaseToast } from '@base-ui/react/toast';
import { TriangleAlert, X } from 'lucide-react';
import { useMessages } from '../i18n/messages';
import { Button } from './button';
import { uiMessages } from './messages';

const manager = BaseToast.createToastManager();

export interface ToastOptions {
  title: string;
  description?: string;
  kind?: 'info' | 'error';
  stay?: boolean;
  action?: { label: string; onClick: () => void };
}

export function showToast({
  title,
  description,
  kind = 'info',
  stay = false,
  action,
}: ToastOptions): string {
  const error = kind === 'error';
  return manager.add({
    title,
    description,
    type: kind,
    priority: error ? 'high' : 'low',
    // A timeout of 0 never fires; other toasts take the Toaster's default.
    ...(error || stay ? { timeout: 0 } : {}),
    ...(action ? { actionProps: { children: action.label, onClick: action.onClick } } : {}),
  });
}

export function closeToast(id: string): void {
  manager.close(id);
}

/** Mount it once near the root. */
export function Toaster() {
  const m = useMessages(uiMessages);
  return (
    <BaseToast.Provider toastManager={manager} limit={3}>
      <BaseToast.Portal>
        {/* Narrow screens keep the bottom panel switcher (shell.tsx) uncovered. */}
        <BaseToast.Viewport
          aria-label={m.notifications}
          className="fixed inset-x-2 bottom-[calc(max(--spacing(2),env(safe-area-inset-bottom))+var(--size-control)+--spacing(2))] outline-none md:inset-x-auto md:right-4 md:bottom-4 md:w-90"
        >
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const m = useMessages(uiMessages);
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root
      key={toast.id}
      toast={toast}
      // The `after` strip bridges the gap to the next toast, so moving between
      // them keeps the timers paused.
      className="absolute inset-x-0 bottom-0 motion-toast rounded-xl bg-raised shadow-popover select-none after:absolute after:inset-x-0 after:top-full after:h-(--toast-gap)"
    >
      <BaseToast.Content className="flex items-start gap-1 p-1.5 pl-3">
        {toast.type === 'error' && (
          <TriangleAlert aria-hidden="true" className="mt-2.5 mr-1.5 size-4 shrink-0 text-danger" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 pr-1">
          <BaseToast.Title className="font-medium" />
          <BaseToast.Description className="break-words text-muted" />
        </div>
        <BaseToast.Action render={<Button />} />
        <BaseToast.Close
          render={<Button variant="ghost" icon aria-label={m.dismissNotification} />}
        >
          <X />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ));
}
