import { clsx } from 'clsx';
import { useRef, type FocusEvent, type MouseEvent, type PointerEvent } from 'react';

// The block moves on the moderate tier and fades on the fast one (docs/UI.md §4).
const MOVE =
  'opacity var(--motion-fast) var(--ease-spring), translate var(--motion-moderate) var(--ease-spring)';
const APPEAR = 'opacity var(--motion-fast) var(--ease-spring)';
const LEAVE = 'opacity var(--motion-fast-exit) var(--ease-exit)';

export interface ListHighlightOptions {
  /**
   * Rings the block while it marks keyboard focus. Lists whose highlight is
   * their focus indicator, like menus, leave it off.
   */
  focusRing?: boolean;
}

/**
 * The one highlight block of a list: file tree, menu (docs/UI.md §5).
 *
 * - It follows the pointer by translateY alone. Over an item it highlights
 *   that item; anywhere else in the list, the nearest one. A click that lands
 *   between items goes to the highlighted one, so what is highlighted is what
 *   a click hits.
 * - When the pointer comes in, it fades in at the nearest item instead of
 *   sliding there from where it was last.
 * - Keyboard focus moves it at once, without animation.
 * - Touch has no hover, so it gets no block.
 *
 * Spread `listProps` on the list, which must be positioned, and render
 * `block` first inside it. Items match `selector` and lie in the list's flow.
 */
export function useListHighlight(
  selector: string,
  { focusRing = false }: ListHighlightOptions = {},
) {
  const block = useRef<HTMLSpanElement>(null);
  const current = useRef<HTMLElement | null>(null);
  const pointerInside = useRef(false);

  const place = (item: HTMLElement | null, { instant = false, focus = false } = {}) => {
    const element = block.current;
    if (!element) return;
    current.current = item;
    if (!item) {
      element.style.transition = LEAVE;
      element.style.opacity = '0';
      delete element.dataset.focus;
      return;
    }
    const hidden = element.style.opacity !== '1';
    const still = instant || hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.style.transition = still ? APPEAR : MOVE;
    element.style.translate = `0 ${item.offsetTop}px`;
    element.style.height = `${item.offsetHeight}px`;
    // Settle the position now, so the next move animates from here.
    if (still) void element.offsetTop;
    element.style.opacity = '1';
    if (focus && focusRing) element.dataset.focus = '';
    else delete element.dataset.focus;
  };

  const itemAt = (list: HTMLElement, target: EventTarget, y: number): HTMLElement | null => {
    const direct = target instanceof Element ? target.closest<HTMLElement>(selector) : null;
    if (direct && list.contains(direct)) return direct;
    let nearest: HTMLElement | null = null;
    let distance = Infinity;
    for (const item of list.querySelectorAll<HTMLElement>(selector)) {
      const box = item.getBoundingClientRect();
      const away = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      if (away < distance) {
        nearest = item;
        distance = away;
      }
    }
    return nearest;
  };

  /** The item holding keyboard focus inside the list, if focus is visible. */
  const focusedItem = (list: HTMLElement): HTMLElement | null => {
    const focused = document.activeElement;
    if (!focused || !list.contains(focused) || !focused.matches(':focus-visible')) return null;
    return focused.closest<HTMLElement>(selector);
  };

  const listProps = {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') return;
      pointerInside.current = true;
      const item = itemAt(event.currentTarget, event.target, event.clientY);
      if (item !== current.current || block.current?.style.opacity !== '1') place(item);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      pointerInside.current = false;
      const focused = focusedItem(event.currentTarget);
      place(focused, { focus: true });
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return;
      const item = event.target.closest<HTMLElement>(selector);
      if (item) place(item, { instant: true, focus: true });
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      if (pointerInside.current) delete block.current?.dataset.focus;
      else place(null);
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (event.target instanceof Element && event.target.closest(selector)) return;
      current.current?.click();
    },
  };

  const element = (
    <span
      ref={block}
      aria-hidden="true"
      className={clsx(
        'pointer-events-none absolute inset-x-1 top-0 rounded-md bg-hover opacity-0',
        'data-focus:shadow-[inset_0_0_0_1px_var(--color-accent)]',
      )}
    />
  );

  return { listProps, block: element };
}
