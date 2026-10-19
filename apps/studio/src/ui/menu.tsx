/*
 * Adapted from shadcn/ui's Base UI dropdown menu and context menu (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dropdown-menu.tsx
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/context-menu.tsx
 */
import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { ReactNode } from 'react';
import { useListHighlight } from './list-highlight';

export const Menu = BaseMenu.Root;
/** Pass the button that opens the menu through `render`. */
export const MenuTrigger = BaseMenu.Trigger;
export const createMenuHandle = BaseMenu.createHandle;
export type MenuHandle<Payload> = BaseMenu.Handle<Payload>;

export const ContextMenu = BaseContextMenu.Root;
export const ContextMenuTrigger = BaseContextMenu.Trigger;

export interface MenuContentProps {
  at?: 'trigger' | 'pointer';
  align?: BaseMenu.Positioner.Props['align'];
  finalFocus?: BaseMenu.Popup.Props['finalFocus'];
  children: ReactNode;
}

export function MenuContent({
  at = 'trigger',
  align = 'start',
  finalFocus,
  children,
}: MenuContentProps) {
  const { listProps, block } = useListHighlight('[role^="menuitem"]');
  const popup = (
    <BaseMenu.Popup
      {...(finalFocus === undefined ? {} : { finalFocus })}
      data-density="compact"
      className="relative min-w-44 motion-popup rounded-lg bg-raised p-1 shadow-popover motion-moderate outline-none"
      {...listProps}
    >
      {block}
      {children}
    </BaseMenu.Popup>
  );
  return (
    <BaseMenu.Portal>
      {at === 'pointer' ? (
        <BaseContextMenu.Positioner collisionPadding={8}>{popup}</BaseContextMenu.Positioner>
      ) : (
        <BaseMenu.Positioner align={align} sideOffset={4} collisionPadding={8}>
          {popup}
        </BaseMenu.Positioner>
      )}
    </BaseMenu.Portal>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function MenuItem({ icon, children, shortcut, onClick, disabled = false }: MenuItemProps) {
  return (
    <BaseMenu.Item
      onClick={onClick}
      disabled={disabled}
      className="relative flex h-(--size-control) cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:opacity-45 [&_svg]:size-(--size-icon) [&_svg]:shrink-0 [&_svg]:text-muted"
    >
      {icon}
      {children}
      {shortcut && <kbd className="ml-auto pl-4 font-sans text-caption text-muted">{shortcut}</kbd>}
    </BaseMenu.Item>
  );
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="mx-1 my-1 h-px bg-line" />;
}
