import type { DataDirectory } from '@tavern-studio/backend';
import { bytesEqual, type Placement } from '@tavern-studio/workspace';
import { db, type SessionFile, type SessionRecord } from '../storage/db';

export interface StoredSession {
  record: SessionRecord;
  files: SessionFile[];
}

/** Lays a persisted Session's files over the fixture's, giving back the data it had. */
export function restoreFiles(data: DataDirectory, files: readonly SessionFile[]): void {
  for (const { path, content } of files) {
    if (content === null) data.delete(path);
    else data.write(path, content);
  }
}

/** Every file where the Session's data differs from the fixture: what persistence keeps. */
export function overlayOf(fixture: DataDirectory, data: DataDirectory): SessionFile[] {
  const paths = new Set([...fixture.paths(), ...data.paths()]);
  return [...paths].flatMap((path) => {
    const content = overlayEntry(fixture, data, path);
    return content === undefined ? [] : [{ path, content }];
  });
}

/** A file's overlay entry: its content, null when deleted, undefined when it is the fixture's. */
export function overlayEntry(
  fixture: DataDirectory,
  data: DataDirectory,
  path: string,
): Uint8Array | null | undefined {
  const original = fixture.read(path);
  const content = data.read(path);
  if (content === undefined) return original === undefined ? undefined : null;
  return original !== undefined && (original === content || bytesEqual(original, content))
    ? undefined
    : content;
}

/**
 * Keeps the Session in IndexedDB (docs/Architecture.md §7). Memory is the
 * truth: every write is queued in order behind the Session's own, never in
 * the path of a synchronous answer. The first failure is reported once and
 * the Session counts as not persisted until the next one begins; writes are
 * not dropped silently and success is never claimed.
 */
export class SessionPersistence {
  #queue: Promise<void> = Promise.resolve();
  #failed = false;
  readonly #onFailure: (error: unknown) => void;

  constructor(onFailure: (error: unknown) => void) {
    this.#onFailure = onFailure;
  }

  get failed(): boolean {
    return this.#failed;
  }

  async load(): Promise<StoredSession | undefined> {
    await this.#queue;
    const database = await db;
    const record = await database.get('session', 'session');
    return record && { record, files: await database.getAll('sessionFiles') };
  }

  /** Starts a new persisted Session: its record and every file that differs from the fixture. */
  begin(record: SessionRecord, files: SessionFile[]): Promise<void> {
    this.#failed = false;
    return this.#enqueue(async () => {
      const tx = (await db).transaction(['session', 'sessionFiles'], 'readwrite');
      const stored = tx.objectStore('sessionFiles');
      await stored.clear();
      await Promise.all([
        ...files.map((file) => stored.put(file)),
        tx.objectStore('session').put(record),
        tx.done,
      ]);
    });
  }

  /** A file now holds `content`, or the fixture's own content when undefined. */
  file(path: string, content: Uint8Array | null | undefined): void {
    void this.#enqueue(async () => {
      const database = await db;
      if (content === undefined) await database.delete('sessionFiles', path);
      else await database.put('sessionFiles', { path, content });
    });
  }

  placements(placements: readonly Placement[]): void {
    void this.#enqueue(() => update({ placements }));
  }

  webHost(state: Record<string, unknown> | null): void {
    void this.#enqueue(() => update({ webHost: state }));
  }

  /** Discards the persisted Session, so the next one starts from the Snapshot. */
  clear(): Promise<void> {
    return this.#enqueue(async () => {
      const tx = (await db).transaction(['session', 'sessionFiles'], 'readwrite');
      await Promise.all([
        tx.objectStore('sessionFiles').clear(),
        tx.objectStore('session').clear(),
        tx.done,
      ]);
    });
  }

  /** Resolves once every queued write has landed or failed. */
  flush(): Promise<void> {
    return this.#queue;
  }

  #enqueue(write: () => Promise<void>): Promise<void> {
    const done = this.#queue.then(write).then(
      () => undefined,
      (error: unknown) => {
        if (!this.#failed) this.#onFailure(error);
        this.#failed = true;
      },
    );
    this.#queue = done;
    return done;
  }
}

/** Changes fields of the stored Session record, within one transaction. */
async function update(change: Partial<SessionRecord>): Promise<void> {
  const tx = (await db).transaction('session', 'readwrite');
  const record = await tx.store.get('session');
  if (record) await tx.store.put({ ...record, ...change });
  await tx.done;
}
