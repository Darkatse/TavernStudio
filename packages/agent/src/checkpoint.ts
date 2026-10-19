import type { JournalEvent } from './journal';

/**
 * An operation is a Run or a rollback. Contents are named by SHA-256 (hex);
 * null means no file.
 */
export interface CheckpointFile {
  op: string;
  path: string;
  /** Before the operation first wrote the file. */
  before: string | null;
  /** After its last write. */
  after: string | null;
}

export interface RestoreStep {
  path: string;
  restore: string | null;
  /** The content the last operation left; anything else means the file changed since. */
  expected: string | null;
}

export function operations(events: readonly JournalEvent[]): string[] {
  return events
    .filter((event) => event.type === 'run_created' || event.type === 'rolled_back')
    .map((event) => event.run);
}

/**
 * A rollback undoes every operation from its target up to itself; rolling
 * back to before a rollback undoes it, and with it the undoing it did.
 */
export function undoneOperations(events: readonly JournalEvent[]): Set<string> {
  const timeline = operations(events);
  const position = new Map(timeline.map((op, index) => [op, index]));
  const targets = new Map(
    events.flatMap((event) =>
      event.type === 'rolled_back' ? [[event.run, event.target] as const] : [],
    ),
  );
  const undone = new Set<string>();
  // From the newest: an operation is undone when a rollback after it that is
  // itself in effect covers it.
  const ranges: [from: number, to: number][] = [];
  for (let index = timeline.length - 1; index >= 0; index--) {
    const op = timeline[index] as string;
    if (ranges.some(([from, to]) => from <= index && index < to)) {
      undone.add(op);
      continue;
    }
    const target = targets.get(op);
    const from = target === undefined ? undefined : position.get(target);
    if (from !== undefined) ranges.push([from, index]);
  }
  return undone;
}

/**
 * Each file changed by an operation from `target` on goes back to its content
 * before the first of them. Files those operations left as they found them
 * are not touched.
 */
export function restorePlan(
  events: readonly JournalEvent[],
  files: readonly CheckpointFile[],
  target: string,
): RestoreStep[] {
  const timeline = operations(events);
  const from = timeline.indexOf(target);
  if (from === -1) throw new Error(`No operation ${target} to roll back to`);
  const position = new Map(timeline.map((op, index) => [op, index]));
  const steps = new Map<string, RestoreStep & { first: number; last: number }>();
  for (const file of files) {
    const at = position.get(file.op);
    if (at === undefined || at < from) continue;
    const step = steps.get(file.path);
    if (!step) {
      steps.set(file.path, {
        path: file.path,
        restore: file.before,
        expected: file.after,
        first: at,
        last: at,
      });
      continue;
    }
    if (at < step.first) Object.assign(step, { first: at, restore: file.before });
    if (at > step.last) Object.assign(step, { last: at, expected: file.after });
  }
  return [...steps.values()]
    .filter((step) => step.restore !== step.expected)
    .map(({ path, restore, expected }) => ({ path, restore, expected }))
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
