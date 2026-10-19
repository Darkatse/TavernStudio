import { readDocument, sameContent, writeDocument } from './documents';
import { formatPointer, getAt, mergePatch, setAt, type JsonValue, type Pointer } from './json';
import type { Placement, ValuePlacement } from './placements';

/** Synchronous reads of a data directory: the fixture's, or the Session's. */
export interface DataReader {
  read(path: string): Uint8Array | undefined;
}

/**
 * The writes that move data from `previous` placements to `next` ones, as a
 * map from data path to new content, or null to delete the file. Unchanged
 * files are left out, so equal content never reads as a session write.
 *
 * Only what the Mounts own changes (docs/Architecture.md §5): a position the
 * project writes takes the project's value; a position it no longer writes
 * goes back to the fixture's; every other position keeps the current data,
 * session writes included. With `current` the fixture itself and no previous
 * placements, this composes a Snapshot.
 */
export function applyPlacements(
  fixture: DataReader,
  current: DataReader,
  previous: readonly Placement[],
  next: readonly Placement[],
): Map<string, Uint8Array | null> {
  const writes = new Map<string, Uint8Array | null>();
  for (const path of new Set([...previous, ...next].map((placement) => placement.path))) {
    const before = previous.filter((placement) => placement.path === path);
    const after = next.filter((placement) => placement.path === path);
    const old = current.read(path);
    const written = applyToPath(path, fixture.read(path), old, before, after);
    const changed =
      written === null ? old !== undefined : old === undefined || !sameContent(path, old, written);
    if (changed) writes.set(path, written);
  }
  return writes;
}

function applyToPath(
  path: string,
  fixture: Uint8Array | undefined,
  current: Uint8Array | undefined,
  before: readonly Placement[],
  after: readonly Placement[],
): Uint8Array | null {
  const file = after.find((placement) => placement.kind === 'file');
  if (file) return file.bytes;

  // A whole file the project no longer places goes back to the fixture's.
  const start = before.some((placement) => placement.kind === 'file') ? fixture : current;
  const values = after.filter(
    (placement): placement is ValuePlacement => placement.kind === 'value',
  );
  const kept = new Set(values.flatMap((placement) => placement.owned.map(formatPointer)));
  const released = before
    .flatMap((placement) => (placement.kind === 'value' ? placement.owned : []))
    .filter((pointer) => !kept.has(formatPointer(pointer)));
  if (values.length === 0 && released.length === 0) return start ?? null;

  const fixtureDocument = fixture && readDocument(path, fixture);
  let document: JsonValue | undefined = start && readDocument(path, start);
  for (const pointer of released)
    document = setAt(document, pointer, getAt(fixtureDocument, pointer));
  for (const placement of values) document = place(document, placement.pointer, placement.patch);
  return document === undefined ? null : writeDocument(path, start ?? fixture, document);
}

function place(document: JsonValue | undefined, pointer: Pointer, patch: JsonValue) {
  return setAt(document, pointer, mergePatch(getAt(document, pointer), patch));
}
