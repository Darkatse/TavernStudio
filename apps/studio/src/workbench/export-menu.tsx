import type { ReactElement, ReactNode } from 'react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../ui/menu';

export interface ExportMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** A project's exports, when it has several (export-button.tsx). */
export function ExportMenu({
  trigger,
  items,
}: {
  /** The button that opens the menu. */
  trigger: ReactElement;
  items: readonly ExportMenuItem[];
}) {
  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuContent align="end">
        {items.map(({ key, label, icon, onClick }) => (
          <MenuItem key={key} icon={icon} onClick={onClick}>
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
