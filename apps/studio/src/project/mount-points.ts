import { formatPointer, type Placement } from '@tavern-studio/workspace';
import { useSyncExternalStore } from 'react';
import { previewSession } from '../preview/session';

/** A placement's mount point as a Mount names it: the data path, then `#` and the JSON Pointer. */
export function mountPoint(placement: Placement): string {
  return placement.kind === 'value'
    ? `${placement.path}#${formatPointer(placement.pointer)}`
    : placement.path;
}

/** The placements the preview Session reflects. */
export function usePlacements(): readonly Placement[] {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.placements);
}

/** The mount points of each project file, keyed by the file. */
export function mountPointsBySource(
  placements: readonly Placement[],
): ReadonlyMap<string, readonly string[]> {
  const bySource = new Map<string, string[]>();
  for (const placement of placements) {
    const points = bySource.get(placement.source) ?? [];
    points.push(mountPoint(placement));
    bySource.set(placement.source, points);
  }
  return bySource;
}
