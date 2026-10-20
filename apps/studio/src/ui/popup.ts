/** The raised list that menus, autocompletes and selects open, and its rows. */
export const popup = {
  surface:
    'relative motion-popup rounded-lg bg-raised p-1 shadow-popover motion-moderate outline-none',
  /** Opened from a field: as wide as the field, and a long list scrolls. */
  anchored:
    'max-h-[min(var(--available-height),18rem)] w-(--anchor-width) overflow-y-auto overscroll-contain',
  row: 'relative flex h-(--size-control) cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:opacity-45 [&_svg]:size-(--size-icon) [&_svg]:shrink-0 [&_svg]:text-muted',
  separator: 'mx-1 my-1 h-px bg-line',
};
