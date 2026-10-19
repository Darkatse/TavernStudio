import { bytesEqual, readDocument, sameContent, writeDocument } from './documents';
import {
  formatPointer,
  getAt,
  jsonEqual,
  mergePatch,
  setAt,
  type JsonValue,
  type Pointer,
} from './json';
import { intendedAt, type Placement, type ValuePlacement } from './placements';

export interface DataReader {
  read(path: string): Uint8Array | undefined;
}

export interface DataChange {
  path: string;
  /** Absent when the whole file changed. */
  pointer?: Pointer;
  /** Absent where the position is now empty. */
  value?: JsonValue;
}

export interface Applied {
  /** New content per data path, or null to delete the file. */
  writes: Map<string, Uint8Array | null>;
  changes: DataChange[];
}

/**
 * Only Mounts whose content changed are placed again, and each one replaces
 * the positions it owns, unadopted session writes there included. A position
 * the project no longer writes goes back to the fixture's value. Everything
 * else keeps the current data, so a session write survives a change to any
 * other mount point. Content that is already in place is neither written nor
 * reported, so it never reads as a session write. With `current` the fixture
 * itself and no previous placements, this composes a Snapshot.
 */
export function applyPlacements(
  fixture: DataReader,
  current: DataReader,
  previous: readonly Placement[],
  next: readonly Placement[],
): Applied {
  const placed = next.filter((placement) => !previous.some((old) => samePlacement(placement, old)));
  const stale = replacedPlacements(previous, next);
  const applied: Applied = { writes: new Map(), changes: [] };
  for (const path of new Set([...placed, ...stale].map((placement) => placement.path))) {
    const at = (placements: readonly Placement[]) =>
      placements.filter((placement) => placement.path === path);
    applyToPath(
      path,
      fixture.read(path),
      current.read(path),
      at(stale),
      at(placed),
      at(next),
      applied,
    );
  }
  return applied;
}

/** Only values are hot-applied; a whole-file change is never held this way. */
export function holdsChange(data: DataReader, change: DataChange): boolean {
  if (change.pointer === undefined) return false;
  const bytes = data.read(change.path);
  const document = bytes && readDocument(change.path, bytes);
  return jsonEqual(getAt(document, change.pointer), change.value);
}

/** Session writes on the positions these placements own do not survive the move. */
export function replacedPlacements(
  previous: readonly Placement[],
  next: readonly Placement[],
): Placement[] {
  return previous.filter((old) => !next.some((placement) => samePlacement(placement, old)));
}

function applyToPath(
  path: string,
  fixture: Uint8Array | undefined,
  current: Uint8Array | undefined,
  stale: readonly Placement[],
  placed: readonly Placement[],
  next: readonly Placement[],
  applied: Applied,
): void {
  const write = (content: Uint8Array | null) => {
    const unchanged =
      content === null
        ? current === undefined
        : current !== undefined && sameContent(path, current, content);
    if (!unchanged) applied.writes.set(path, content);
    return !unchanged;
  };

  const file = placed.find((placement) => placement.kind === 'file');
  if (file) {
    if (write(file.bytes)) applied.changes.push({ path });
    return;
  }
  // A whole file the project no longer places goes back to the fixture's.
  const restored = stale.some((placement) => placement.kind === 'file') && !next.some(isFile);
  const start = restored ? fixture : current;
  if (restored && write(fixture ?? null)) applied.changes.push({ path });

  const values = placed.filter(
    (placement): placement is ValuePlacement => placement.kind === 'value',
  );
  const owned = new Set(
    next
      .flatMap((placement) => (placement.kind === 'value' ? placement.owned : []))
      .map(formatPointer),
  );
  const released = stale
    .flatMap((placement) => (placement.kind === 'value' ? placement.owned : []))
    .filter((pointer) => !owned.has(formatPointer(pointer)));
  if (values.length === 0 && released.length === 0) return;

  const fixtureDocument = fixture && readDocument(path, fixture);
  const before: JsonValue | undefined = start && readDocument(path, start);
  let document = before;
  const moved: DataChange[] = [];
  const report = (pointer: Pointer, value: JsonValue | undefined) => {
    if (jsonEqual(getAt(before, pointer), value)) return;
    moved.push(value === undefined ? { path, pointer } : { path, pointer, value });
  };
  for (const pointer of released) {
    const value = getAt(fixtureDocument, pointer);
    document = setAt(document, pointer, value);
    report(pointer, value);
  }
  for (const placement of values) {
    const target = mergePatch(getAt(document, placement.pointer), placement.patch);
    document = setAt(document, placement.pointer, target);
    for (const pointer of placement.owned) report(pointer, intendedAt(placement, pointer));
  }
  if (write(document === undefined ? null : writeDocument(path, start ?? fixture, document))) {
    applied.changes.push(...moved);
  }
}

function isFile(placement: Placement): boolean {
  return placement.kind === 'file';
}

function samePlacement(a: Placement, b: Placement): boolean {
  if (a.path !== b.path) return false;
  if (a.kind === 'file' || b.kind === 'file') {
    return a.kind === 'file' && b.kind === 'file' && bytesEqual(a.bytes, b.bytes);
  }
  return formatPointer(a.pointer) === formatPointer(b.pointer) && jsonEqual(a.patch, b.patch);
}
