import type { DataDirectory } from '@tavern-studio/backend';
import { bytesEqual, type Placement } from '@tavern-studio/workspace';
import {
  withDatabase,
  type SessionFile,
  type SessionRecord,
  type StudioDatabase,
} from '../storage/db';

export interface StoredSession {
  record: SessionRecord;
  files: SessionFile[];
}

export function restoreFiles(data: DataDirectory, files: readonly SessionFile[]): void {
  for (const { path, content } of files) {
    if (content === null) data.delete(path);
    else data.write(path, content);
  }
}

export function overlayOf(fixture: DataDirectory, data: DataDirectory): SessionFile[] {
  const paths = new Set([...fixture.paths(), ...data.paths()]);
  return [...paths].flatMap((path) => {
    const content = overlayEntry(fixture, data, path);
    return content === undefined ? [] : [{ path, content }];
  });
}

/** The file's content, null when deleted, undefined when it is the fixture's. */
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
 * Memory is the truth: every write is queued in order behind the Session's
 * own, never in the path of a synchronous answer. The first failure is
 * reported once and the Session counts as not persisted until the next one
 * begins; writes are not dropped silently and success is never claimed.
 */
export class SessionPersistence {
  #queue: Promise<void> = Promise.resolve();
  #error: string | undefined;
  readonly #onFailure: (error: unknown) => void;

  constructor(onFailure: (error: unknown) => void) {
    this.#onFailure = onFailure;
  }

  get error(): string | undefined {
    return this.#error;
  }

  async load(): Promise<StoredSession | undefined> {
    await this.#queue;
    return withDatabase(async (database) => {
      const record = await database.get('session', 'session');
      return record && { record, files: await database.getAll('sessionFiles') };
    });
  }

  begin(record: SessionRecord, files: SessionFile[]): Promise<void> {
    this.#error = undefined;
    return this.#enqueue(async (database) => {
      const tx = database.transaction(['session', 'sessionFiles'], 'readwrite');
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
    void this.#enqueue(async (database) => {
      if (content === undefined) await database.delete('sessionFiles', path);
      else await database.put('sessionFiles', { path, content });
    });
  }

  placements(placements: readonly Placement[]): void {
    void this.#enqueue((database) => update(database, { placements }));
  }

  webHost(state: Record<string, unknown> | null): void {
    void this.#enqueue((database) => update(database, { webHost: state }));
  }

  clear(): Promise<void> {
    return this.#enqueue(async (database) => {
      const tx = database.transaction(['session', 'sessionFiles'], 'readwrite');
      await Promise.all([
        tx.objectStore('sessionFiles').clear(),
        tx.objectStore('session').clear(),
        tx.done,
      ]);
    });
  }

  flush(): Promise<void> {
    return this.#queue;
  }

  #enqueue(write: (database: StudioDatabase) => Promise<void>): Promise<void> {
    const done = this.#queue
      .then(() => withDatabase(write))
      .then(
        () => undefined,
        (error: unknown) => {
          if (this.#error !== undefined) return;
          this.#error = error instanceof Error ? error.message : String(error);
          this.#onFailure(error);
        },
      );
    this.#queue = done;
    return done;
  }
}

async function update(database: StudioDatabase, change: Partial<SessionRecord>): Promise<void> {
  const tx = database.transaction('session', 'readwrite');
  const record = await tx.store.get('session');
  if (record) await tx.store.put({ ...record, ...change });
  await tx.done;
}
