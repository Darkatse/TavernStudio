import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { segmented } from './segmented';

export const Tabs = BaseTabs.Root;
export const TabsPanel = BaseTabs.Panel;

export function TabsList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BaseTabs.List aria-label={label} className={segmented.track}>
      <BaseTabs.Indicator
        className={clsx(segmented.thumb, 'w-(--active-tab-width) translate-x-(--active-tab-left)')}
      />
      {children}
    </BaseTabs.List>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Tab value={value} className={clsx(segmented.item, 'data-active:text-fg')}>
      {children}
    </BaseTabs.Tab>
  );
}
