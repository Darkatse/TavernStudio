import type { ReactElement, ReactNode } from 'react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../ui/menu';

export interface ExportMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

export function ExportMenu({
  trigger,
  items,
}: {
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
