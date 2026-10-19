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

/** A duration for people: "8 秒", "1 分 2 秒". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
