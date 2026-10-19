import { useEffect, useState } from 'react';

/** The current time, updated every `interval` ms while `ticking`, for live timers. */
export function useNow(ticking: boolean, interval = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [ticking, interval]);
  return now;
}
