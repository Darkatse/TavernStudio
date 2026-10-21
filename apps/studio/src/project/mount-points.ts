import { urlPathForData } from '@tavern-studio/preview';
import { formatPointer, type Placement } from '@tavern-studio/workspace';
import { useSyncExternalStore } from 'react';
import { previewSession } from '../preview/session';

/** A placement's mount point as a Mount names it. */
export function mountPoint(placement: Placement): string {
  return placement.kind === 'value'
    ? `${placement.path}#${formatPointer(placement.pointer)}`
    : placement.path;
}

export function usePlacements(): readonly Placement[] {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.placements);
}

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

/** Where the preview serves a project file: a Mount places it on a path the vendor serves. */
export function previewUrlOf(placements: readonly Placement[], source: string): string | undefined {
  for (const placement of placements) {
    if (placement.kind !== 'file' || placement.source !== source) continue;
    const url = urlPathForData(placement.path);
    if (url) return url;
  }
  return undefined;
}
