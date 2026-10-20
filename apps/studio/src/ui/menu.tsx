/*
 * Adapted from shadcn/ui's Base UI dropdown menu and context menu (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dropdown-menu.tsx
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/context-menu.tsx
 */
import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useListHighlight } from './list-highlight';
import { popup } from './popup';

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
  const content = (
    <BaseMenu.Popup
      {...(finalFocus === undefined ? {} : { finalFocus })}
      data-density="compact"
      className={clsx(popup.surface, 'min-w-44')}
      {...listProps}
    >
      {block}
      {children}
    </BaseMenu.Popup>
  );
  return (
    <BaseMenu.Portal>
      {at === 'pointer' ? (
        <BaseContextMenu.Positioner collisionPadding={8}>{content}</BaseContextMenu.Positioner>
      ) : (
        <BaseMenu.Positioner align={align} sideOffset={4} collisionPadding={8}>
          {content}
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
    <BaseMenu.Item onClick={onClick} disabled={disabled} className={popup.row}>
      {icon}
      {children}
      {shortcut && <kbd className="ml-auto pl-4 font-sans text-caption text-muted">{shortcut}</kbd>}
    </BaseMenu.Item>
  );
}

export function MenuRadioGroup<Value extends string>({
  value,
  onValueChange,
  children,
}: {
  value: Value;
  onValueChange: (value: Value) => void;
  children: ReactNode;
}) {
  return (
    <BaseMenu.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </BaseMenu.RadioGroup>
  );
}

/** Choosing one closes the menu, as choosing an item does. */
export function MenuRadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseMenu.RadioItem value={value} closeOnClick className={popup.row}>
      {children}
      <BaseMenu.RadioItemIndicator className="ml-auto">
        <Check />
      </BaseMenu.RadioItemIndicator>
    </BaseMenu.RadioItem>
  );
}

export function MenuSeparator() {
  return <BaseMenu.Separator className={popup.separator} />;
}
