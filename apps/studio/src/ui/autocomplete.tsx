/*
 * A field with suggestions (Base UI Autocomplete). The popup is a menu's
 * (ui/menu.tsx): raised surface, `motion-popup`, compact rows sharing one
 * highlight block (docs/UI.md §5). The input keeps DOM focus and the active
 * row is virtual (§5, 焦点), so the block follows it through `follow`.
 */
import { Autocomplete as BaseAutocomplete } from '@base-ui/react/autocomplete';
import { useRef, useState, type ReactNode } from 'react';
import { Input, type InputProps } from './input';
import { useListHighlight } from './list-highlight';

const ROW = '[role="option"]';

export interface AutocompleteProps<Item> {
  value: string;
  onValueChange: (value: string) => void;
  /** Suggestions; any other text stays a valid value. With none, the field is a plain input. */
  items: readonly Item[];
  /** What picking an item puts in the field. */
  itemToString: (item: Item) => string;
  /** A row's content. */
  children: (item: Item) => ReactNode;
  /** Shown when the typed text matches no item. */
  empty: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input?: InputProps;
}

export function Autocomplete<Item>({
  value,
  onValueChange,
  items,
  itemToString,
  children,
  empty,
  open,
  onOpenChange,
  input,
}: AutocompleteProps<Item>) {
  const { contains } = BaseAutocomplete.useFilter({ sensitivity: 'base' });
  // Opening shows every item; typing filters them. Filtering by the value
  // itself would show only the current item whenever the list reopens.
  const [query, setQuery] = useState('');
  const shown = query === '' ? items : items.filter((item) => contains(itemToString(item), query));
  const popup = useRef<HTMLDivElement>(null);
  const { listProps, block, follow } = useListHighlight(ROW);

  return (
    <BaseAutocomplete.Root
      items={items}
      filteredItems={shown}
      itemToStringValue={itemToString}
      value={value}
      onValueChange={(next, details) => {
        if (details.reason === 'input-change') setQuery(next);
        onValueChange(next);
      }}
      open={open && items.length > 0}
      onOpenChange={(next) => {
        if (next) setQuery('');
        onOpenChange(next);
      }}
      openOnInputClick
      onItemHighlighted={(_item, { reason, index }) => {
        // The block follows the pointer on its own.
        if (reason === 'pointer') return;
        follow(popup.current?.querySelectorAll<HTMLElement>(ROW)[index] ?? null);
      }}
    >
      <BaseAutocomplete.Input render={<Input spellCheck={false} {...input} />} />
      <BaseAutocomplete.Portal>
        <BaseAutocomplete.Positioner align="start" sideOffset={4} collisionPadding={8}>
          <BaseAutocomplete.Popup
            ref={popup}
            data-density="compact"
            className="relative max-h-[min(var(--available-height),18rem)] w-(--anchor-width) motion-popup overflow-y-auto overscroll-contain rounded-lg bg-raised p-1 shadow-popover motion-moderate outline-none"
            {...listProps}
          >
            {block}
            <BaseAutocomplete.Empty className="text-caption text-muted not-empty:px-2 not-empty:py-1.5">
              {empty}
            </BaseAutocomplete.Empty>
            <BaseAutocomplete.List>
              {(item: Item) => (
                <BaseAutocomplete.Item
                  key={itemToString(item)}
                  value={item}
                  className="relative flex h-(--size-control) cursor-default items-center gap-2 rounded-md px-2 outline-none select-none"
                >
                  {children(item)}
                </BaseAutocomplete.Item>
              )}
            </BaseAutocomplete.List>
          </BaseAutocomplete.Popup>
        </BaseAutocomplete.Positioner>
      </BaseAutocomplete.Portal>
    </BaseAutocomplete.Root>
  );
}
