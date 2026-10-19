import { useEffect, useState } from 'react';

export const QUIET_WAIT_MS = 300;

/**
 * Its container is positioned and says it is busy all along: the line shows
 * only once the wait outlasts a quiet one.
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
