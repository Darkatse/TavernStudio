import { useEffect, useState } from 'react';

/** Waits shorter than this show no progress at all (docs/UI.md §5). */
export const QUIET_WAIT_MS = 300;

/**
 * A hairline running along the top edge of its positioned container, for a
 * wait of unknown length. It shows only once the wait outlasts a quiet one;
 * the container says it is busy all along.
 */
export function LoadingLine({ label }: { label: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), QUIET_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!shown) return null;
  return (
    <span className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 w-1/3 animate-indeterminate bg-fg/35"
      />
    </span>
  );
}
