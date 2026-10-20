/*
 * Adapted from shadcn/ui's Base UI select (MIT, Copyright (c) 2023 shadcn):
 * https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/select.tsx
 */
import { Select as BaseSelect } from '@base-ui/react/select';
import { clsx } from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { Fragment } from 'react';
import { fieldSurface } from './input';
import { useListHighlight } from './list-highlight';
import { popup } from './popup';

export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SelectProps<Value extends string> {
  /** The trigger's, for the field's label. */
  id: string;
  value: Value;
  onValueChange: (value: Value) => void;
  /** A line falls between groups. */
  groups: readonly (readonly SelectOption<Value>[])[];
}

/** The list opens below the trigger, as a menu does, rather than over it. */
export function Select<Value extends string>({
  id,
  value,
  onValueChange,
  groups,
}: SelectProps<Value>) {
  const { listProps, block } = useListHighlight('[role="option"]');
  return (
    <BaseSelect.Root
      id={id}
      value={value}
      // No option is null, so no choice is.
      onValueChange={(next) => onValueChange(next!)}
      items={groups.flat()}
    >
      <BaseSelect.Trigger
        className={clsx(fieldSurface, 'flex cursor-pointer items-center gap-2 text-left')}
      >
        <BaseSelect.Value className="min-w-0 flex-1 truncate" />
        <ChevronDown className="size-(--size-icon) shrink-0 text-muted" />
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          alignItemWithTrigger={false}
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <BaseSelect.Popup
            data-density="compact"
            className={clsx(popup.surface, popup.anchored)}
            {...listProps}
          >
            {block}
            {groups.map((group, index) => (
              <Fragment key={index}>
                {index > 0 && <BaseSelect.Separator className={popup.separator} />}
                {group.map((option) => (
                  <BaseSelect.Item key={option.value} value={option.value} className={popup.row}>
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator className="ml-auto">
                      <Check />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </Fragment>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
