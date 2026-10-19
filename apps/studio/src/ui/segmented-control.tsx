import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { clsx } from 'clsx';
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { segmented } from './segmented';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Stretch to the container and split it evenly between options. */
  fill?: boolean;
  /** Shows the current choice but takes no input, for example while it is being applied. */
  disabled?: boolean;
}

/** One choice out of a few, as a radio group. Tabs share its look. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  fill = false,
  disabled = false,
}: SegmentedControlProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const thumb = useItemBox(group, value);

  return (
    <RadioGroup<T>
      ref={group}
      aria-label={label}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      className={clsx(
        segmented.track,
        'transition-opacity motion-fast data-disabled:opacity-60',
        fill && 'flex w-full',
      )}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={segmented.thumb}
          style={{ translate: `${thumb.left}px`, width: thumb.width }}
        />
      )}
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          data-value={option.value}
          className={clsx(segmented.item, 'data-checked:text-fg', fill && 'flex-1')}
        >
          {option.icon}
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

/** Where the item for `value` sits inside the group, kept current as the group resizes. */
function useItemBox(group: RefObject<HTMLElement | null>, value: string) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const element = group.current;
    if (!element) return;
    const measure = () => {
      const item = element.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      setBox(item ? { left: item.offsetLeft, width: item.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [group, value]);

  return box;
}
