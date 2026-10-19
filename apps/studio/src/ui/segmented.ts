/**
 * Shared look of segmented choices (Tabs and SegmentedControl): a sunken
 * track, items, and a raised thumb that slides to the selected item.
 * Item height + track padding equals the control height (docs/UI.md §3).
 */
export const segmented = {
  track:
    'relative inline-flex items-center rounded-lg bg-sunken p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]',
  item: 'relative z-10 inline-flex h-[calc(var(--size-control)-4px)] cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap text-muted transition-colors select-none motion-fast hover:text-fg data-disabled:cursor-default data-disabled:hover:text-muted [&_svg]:size-(--size-icon) [&_svg]:shrink-0',
  // Width transitions too (docs/UI.md §4): the thumb is a small absolute element.
  // With reduced motion it moves at once.
  thumb:
    'absolute top-0.5 bottom-0.5 left-0 rounded-md bg-raised shadow-thumb transition-[translate,width] motion-moderate motion-reduce:transition-none',
};
