/*
 * The input keeps DOM focus and the active row is virtual, so the highlight
 * block follows it through `follow`.
 */
import { Autocomplete as BaseAutocomplete } from '@base-ui/react/autocomplete';
import { clsx } from 'clsx';
import { useRef, useState, type ReactNode } from 'react';
import { Input, type InputProps } from './input';
import { useListHighlight } from './list-highlight';
import { popup } from './popup';

const ROW = '[role="option"]';

export interface AutocompleteProps<Item> {
  value: string;
  onValueChange: (value: string) => void;
  /** Suggestions only: any other text stays a valid value. */
  items: readonly Item[];
  itemToString: (item: Item) => string;
  children: (item: Item) => ReactNode;
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
  // Filtering by the value itself would show only the current item whenever
  // the list reopens.
  const [query, setQuery] = useState('');
  const shown = query === '' ? items : items.filter((item) => contains(itemToString(item), query));
  const listbox = useRef<HTMLDivElement>(null);
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
        follow(listbox.current?.querySelectorAll<HTMLElement>(ROW)[index] ?? null);
      }}
    >
      <BaseAutocomplete.Input render={<Input spellCheck={false} {...input} />} />
      <BaseAutocomplete.Portal>
        <BaseAutocomplete.Positioner align="start" sideOffset={4} collisionPadding={8}>
          <BaseAutocomplete.Popup
            ref={listbox}
            data-density="compact"
            className={clsx(popup.surface, popup.anchored)}
            {...listProps}
          >
            {block}
            <BaseAutocomplete.Empty className="text-caption text-muted not-empty:px-2 not-empty:py-1.5">
              {empty}
            </BaseAutocomplete.Empty>
            <BaseAutocomplete.List>
              {(item: Item) => (
                <BaseAutocomplete.Item key={itemToString(item)} value={item} className={popup.row}>
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
