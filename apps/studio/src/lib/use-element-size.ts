import { useState } from 'react';
import { flushSync } from 'react-dom';

export interface Size {
  width: number;
  height: number;
}

/** The content-box size of the element given the returned ref; `null` until first measured. */
export function useElementSize() {
  const [size, setSize] = useState<Size | null>(null);

  const ref = (element: HTMLElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      // Committed before paint, so what is laid out from the size changes in
      // the same frame as the element, not one frame behind it.
      flushSync(() => {
        for (const entry of entries) {
          setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  };

  return [ref, size] as const;
}
