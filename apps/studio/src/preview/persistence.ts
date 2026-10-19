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
    const record = await db.session.get('session');
    return record && { record, files: await db.sessionFiles.toArray() };
  }

  /** Starts a new persisted Session: its record and every file that differs from the fixture. */
  begin(record: SessionRecord, files: SessionFile[]): Promise<void> {
    this.#failed = false;
    return this.#enqueue(() =>
      db.transaction('rw', db.session, db.sessionFiles, async () => {
        await db.sessionFiles.clear();
        await db.sessionFiles.bulkPut(files);
        await db.session.put(record);
      }),
    );
  }

  /** A file now holds `content`, or the fixture's own content when undefined. */
  file(path: string, content: Uint8Array | null | undefined): void {
    void this.#enqueue(() =>
      content === undefined ? db.sessionFiles.delete(path) : db.sessionFiles.put({ path, content }),
    );
  }

  placements(placements: readonly Placement[]): void {
    void this.#enqueue(() => db.session.update('session', { placements }));
  }

  webHost(state: Record<string, unknown> | null): void {
    void this.#enqueue(() => db.session.update('session', { webHost: state }));
  }

  /** Discards the persisted Session, so the next one starts from the Snapshot. */
  clear(): Promise<void> {
    return this.#enqueue(() =>
      db.transaction('rw', db.session, db.sessionFiles, async () => {
        await db.sessionFiles.clear();
        await db.session.clear();
      }),
    );
  }

  /** Resolves once every queued write has landed or failed. */
  flush(): Promise<void> {
    return this.#queue;
  }

  #enqueue(write: () => Promise<unknown>): Promise<void> {
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
