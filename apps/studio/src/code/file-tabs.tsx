import { clsx } from 'clsx';
import { X } from 'lucide-react';
import type { KeyboardEvent, WheelEvent } from 'react';
import type { Editors, Tab } from '../editor/editors';
import { useMessages } from '../i18n/messages';
import { nameOf, parentOf } from '../project/paths';
import { codeMessages } from './messages';

// A vertical wheel scrolls the strip sideways; it has no room for a scrollbar.
function onWheel(event: WheelEvent<HTMLDivElement>) {
  if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
}

export interface FileTabsProps {
  editors: Editors;
  tabs: readonly Tab[];
  active: string | undefined;
  /** The id of the panel the tabs control. */
  panel: string;
}

/**
 * The open files (docs/UI.md §5). Tabs close and overflow, so they are not
 * a segmented track: the active tab shares the editor's surface and joins
 * it, the strip scrolls sideways, and arrow keys move between tabs.
 */
export function FileTabs({ editors, tabs, active, panel }: FileTabsProps) {
  const m = useMessages(codeMessages);
  const select = (path: string, element: HTMLElement | undefined) => {
    editors.activate(path);
    element?.focus();
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    const all = [...strip.querySelectorAll<HTMLElement>('[role="tab"]')];
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    const target =
      step !== undefined
        ? (at + step + all.length) % all.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? all.length - 1
            : undefined;
    if (target !== undefined) {
      event.preventDefault();
      const tab = tabs[target];
      if (tab) select(tab.path, all[target]);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const tab = tabs[at];
      if (tab) void editors.close(tab.path).then(() => focusActive(strip));
    }
  };

  return (
    <div
      role="tablist"
      aria-label={m.openTabs}
      tabIndex={-1}
      data-density="compact"
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      className="flex h-9 shrink-0 [scrollbar-width:none] overflow-x-auto overflow-y-hidden overscroll-x-contain bg-sunken shadow-[inset_0_-1px_0_var(--color-line)]"
    >
      {tabs.map((tab) => (
        <FileTab
          key={tab.path}
          tab={tab}
          label={labelOf(tab.path, tabs)}
          active={tab.path === active}
          panel={panel}
          onSelect={(element) => select(tab.path, element)}
          onClose={() => void editors.close(tab.path)}
        />
      ))}
    </div>
  );
}

function FileTab({
  tab,
  label,
  active,
  panel,
  onSelect,
  onClose,
}: {
  tab: Tab;
  label: { name: string; folder: string | undefined };
  active: boolean;
  panel: string;
  onSelect: (element: HTMLElement) => void;
  onClose: () => void;
}) {
  const m = useMessages(codeMessages);
  return (
    <div
      className={clsx(
        // The active tab is the editor's surface, and covers the strip's
        // bottom line so the two join.
        'group/tab relative flex shrink-0 items-center transition-colors motion-fast',
        active
          ? 'bg-surface text-fg shadow-[1px_0_0_var(--color-line),-1px_0_0_var(--color-line)]'
          : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls={panel}
        tabIndex={active ? 0 : -1}
        onClick={(event) => onSelect(event.currentTarget)}
        onAuxClick={(event) => {
          if (event.button === 1) onClose();
        }}
        className="flex h-full max-w-56 cursor-pointer items-center gap-1.5 py-0 pr-8 pl-3 outline-none select-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)]"
      >
        <span className="truncate">{label.name}</span>
        {label.folder && <span className="truncate text-caption text-muted">{label.folder}</span>}
      </button>
      <span className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center pointer-coarse:size-7">
        {/*
         * The dirty dot and the close button share one cell (docs/UI.md §5).
         * The one coming in takes the full fast tier, the one going out the
         * exit step.
         */}
        {tab.dirty && (
          <span
            aria-hidden="true"
            className="col-start-1 row-start-1 size-2 rounded-full bg-fg transition-opacity motion-fast group-focus-within/tab:opacity-0 group-focus-within/tab:motion-fast-exit group-hover/tab:opacity-0 group-hover/tab:motion-fast-exit pointer-coarse:opacity-0"
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={m.closeTab(tab.path)}
          onClick={onClose}
          className={clsx(
            'col-start-1 row-start-1 grid size-full cursor-pointer place-items-center rounded-sm text-muted transition-[opacity,background-color] motion-fast-exit group-focus-within/tab:opacity-100 group-focus-within/tab:motion-fast group-hover/tab:opacity-100 group-hover/tab:motion-fast hover:bg-hover hover:text-fg pointer-coarse:opacity-100',
            active && !tab.dirty ? 'opacity-100' : 'opacity-0',
          )}
        >
          <X className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

/** A tab's name, with its folder when another open file has the same name. */
function labelOf(path: string, tabs: readonly Tab[]): { name: string; folder: string | undefined } {
  const name = nameOf(path);
  const shared = tabs.some((tab) => tab.path !== path && nameOf(tab.path) === name);
  return { name, folder: shared ? parentOf(path) || '/' : undefined };
}

function focusActive(strip: HTMLElement): void {
  strip.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
}
