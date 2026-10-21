import { clsx } from 'clsx';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { flushSync } from 'react-dom';

const separators = {
  // The gap between two floating panels; a pill shows where it is held.
  gap: {
    width: 8,
    className: 'flex w-2 items-center justify-center',
    indicator: (
      <span className="h-10 w-0.5 rounded-full bg-line-strong opacity-0 transition-[opacity,background-color] motion-fast group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100 group-data-dragging:bg-accent group-data-dragging:opacity-100" />
    ),
  },
  // A hairline inside one panel, held by a wider strip around it, which the
  // columns' positioned content would otherwise cover.
  line: {
    width: 1,
    className: 'relative z-10 w-px bg-line before:absolute before:inset-y-0 before:-inset-x-1',
    indicator: (
      <span className="absolute inset-y-0 -left-px w-[3px] bg-accent opacity-0 transition-opacity motion-fast group-hover:opacity-60 group-focus-visible:opacity-100 group-data-dragging:opacity-100" />
    ),
  },
};

/** A share of the row per arrow key. */
const KEY_STEP = 0.05;

export interface SplitProps {
  /** The side column's width in CSS pixels, until it is dragged. */
  defaultSize: number;
  minSize: number;
  /** The main column's minimum width in CSS pixels. */
  mainMinSize: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  separator: keyof typeof separators;
  sideId: string;
  sideRef?: Ref<HTMLDivElement>;
  side: ReactNode;
  children: ReactNode;
  /** Layout only. */
  className?: string;
}

/**
 * A side column beside the main one, which the author drags wider or
 * narrower, or collapses. It keeps its width in pixels as the row changes,
 * up to half the row and what leaves the main column its minimum.
 */
export function Split({
  defaultSize,
  minSize,
  mainMinSize,
  collapsed,
  onCollapsedChange,
  separator: kind,
  sideId,
  sideRef,
  side,
  children,
  className,
}: SplitProps) {
  const separator = separators[kind];
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; from: number }>(undefined);
  const [size, setSize] = useState(defaultSize);
  const [rowWidth, setRowWidth] = useState<number>();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // Rendered before the frame is painted, so the columns never show a width
    // the row cannot hold.
    const observer = new ResizeObserver(([entry]) =>
      flushSync(() => setRowWidth(entry!.contentRect.width)),
    );
    observer.observe(row.current!);
    return () => observer.disconnect();
  }, []);

  const maxSize =
    rowWidth === undefined
      ? undefined
      : Math.max(minSize, Math.min(rowWidth / 2, rowWidth - separator.width - mainMinSize));
  const clamp = (width: number) => Math.min(Math.max(width, minSize), maxSize ?? width);
  const shown = clamp(size);

  const expandTo = (width: number) => {
    setSize(clamp(width));
    if (collapsed) onCollapsedChange(false);
  };
  // Dragged below half its minimum, the column collapses.
  const dragTo = (width: number) => {
    if (width >= minSize / 2) expandTo(width);
    else if (!collapsed) onCollapsedChange(true);
  };

  return (
    <div ref={row} className={clsx('flex', className)}>
      <div
        id={sideId}
        ref={sideRef}
        inert={collapsed}
        className="relative shrink-0 overflow-hidden"
        style={{ width: collapsed ? 0 : shown }}
      >
        {/* It keeps its width while the column opens or closes around it, so nothing in it rewraps. */}
        <div className="absolute inset-y-0 right-0" style={{ width: shown }}>
          {side}
        </div>
      </div>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A focusable splitter holds its indicator; <hr> holds nothing.
        role="separator"
        aria-orientation="vertical"
        aria-controls={sideId}
        aria-valuemin={0}
        aria-valuemax={maxSize === undefined ? undefined : Math.round(maxSize)}
        aria-valuenow={collapsed ? 0 : Math.round(shown)}
        tabIndex={0}
        data-dragging={dragging || undefined}
        className={clsx(
          'group shrink-0 cursor-col-resize touch-none outline-none',
          separator.className,
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // Captured, the drag goes on over the preview's iframe.
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          drag.current = { x: event.clientX, from: collapsed ? 0 : shown };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current) dragTo(drag.current.from + event.clientX - drag.current.x);
        }}
        onLostPointerCapture={() => {
          drag.current = undefined;
          setDragging(false);
        }}
        onKeyDown={(event) => {
          const step = (rowWidth ?? 0) * KEY_STEP;
          switch (event.key) {
            case 'ArrowLeft':
              if (!collapsed) expandTo(shown - step);
              break;
            case 'ArrowRight':
              expandTo(collapsed ? shown : shown + step);
              break;
            case 'Home':
              expandTo(minSize);
              break;
            case 'End':
              expandTo(maxSize ?? shown);
              break;
            case 'Enter':
              onCollapsedChange(!collapsed);
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
      >
        {separator.indicator}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
