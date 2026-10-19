import { describe, expect, test } from '@rstest/core';
import { restorePlan, undoneOperations, type CheckpointFile } from './checkpoint';
import type { JournalEvent } from './journal';

const run = (id: string): JournalEvent => ({ type: 'run_created', run: id, time: 0 });
const rollback = (id: string, target: string): JournalEvent => ({
  type: 'rolled_back',
  run: id,
  target,
  files: 0,
  time: 0,
});

describe('undoneOperations', () => {
  test('undoing a rollback brings back what it undid', () => {
    const events = [run('a'), run('b'), run('c'), rollback('r1', 'b')];
    expect([...undoneOperations(events)].toSorted()).toEqual(['b', 'c']);

    const undone = [...events, rollback('r2', 'r1')];
    expect([...undoneOperations(undone)]).toEqual(['r1']);
  });

  test('a rollback inside a later one stays undone with it', () => {
    const events = [run('a'), run('b'), rollback('r1', 'b'), run('c'), rollback('r2', 'a')];
    expect([...undoneOperations(events)].toSorted()).toEqual(['a', 'b', 'c', 'r1']);
  });
});

describe('restorePlan', () => {
  test('restores each file to before its first change from the target on', () => {
    const events = [run('a'), run('b'), run('c')];
    const files: CheckpointFile[] = [
      { op: 'a', path: 'theme.css', before: 'v0', after: 'v1' },
      { op: 'b', path: 'theme.css', before: 'v1', after: 'v2' },
      { op: 'c', path: 'theme.css', before: 'v2', after: 'v3' },
      { op: 'b', path: 'new.css', before: null, after: 'n1' },
      // Changed and changed back: nothing to restore.
      { op: 'c', path: 'same.json', before: 's0', after: 's0' },
    ];
    expect(restorePlan(events, files, 'b')).toEqual([
      { path: 'new.css', restore: null, expected: 'n1' },
      { path: 'theme.css', restore: 'v1', expected: 'v3' },
    ]);
  });
});
