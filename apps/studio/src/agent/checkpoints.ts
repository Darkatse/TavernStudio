import {
  operations,
  restorePlan,
  type CheckpointFile,
  type JournalEvent,
  type WorkspaceRoot,
} from '@tavern-studio/agent';
import type { ProjectStore, ReplacedContent } from '@tavern-studio/workspace';
import { sha256 } from '@tavern-studio/workspace';
import { withDatabase, type CheckpointFileRecord } from '../storage/db';

/** Bytes of compressed content a project's Checkpoint holds at most. */
export const CHECKPOINT_LIMIT = 100 * 1024 * 1024;

export interface RollbackFile {
  path: string;
  /** The content to restore; null removes the file, which the rolled back operations created. */
  restore: string | null;
  /** The file now, read once for the check below and kept by the rollback. */
  current: ReplacedContent;
  /** Something changed the file after the operations last wrote it; rolling back overwrites that. */
  conflict: boolean;
}

export interface RollbackPlan {
  target: string;
  files: RollbackFile[];
}

export class Checkpoints {
  readonly #project: string;
  readonly #store: ProjectStore;
  readonly #changed: (file: CheckpointFile) => void;

  constructor(project: string, store: ProjectStore, changed: (file: CheckpointFile) => void) {
    this.#project = project;
    this.#store = store;
    this.#changed = changed;
  }

  async load(): Promise<CheckpointFile[]> {
    const records = await this.#records();
    return records.map(({ op, path, before, after }) => ({ op, path, before, after }));
  }

  /**
   * Before a Run first changes a file, the content it replaces is kept, from
   * the read the write's own check makes.
   */
  root(op: string): WorkspaceRoot {
    const store = this.#store;
    const kept = new Map<string, { before: string | null; size: number }>();
    return {
      kind: (path) => store.kind(path),
      read: (path) => store.read(path),
      files: (directory) => store.files(directory),
      write: async (path, content, expected) => {
        const keep = kept.has(path)
          ? undefined
          : async (replaced: ReplacedContent) => {
              const before = await this.#keep(replaced);
              // Recorded before the write, so a write that lands is never without its original.
              await this.#put({ op, path, ...before, after: before.before });
              kept.set(path, before);
            };
        const after = await store.write(path, content, expected, keep);
        const before = kept.get(path);
        if (!before) throw new Error(`The Checkpoint did not keep ${path} before writing it`);
        await this.#put({ op, path, ...before, after });
        return after;
      },
    };
  }

  async plan(
    events: readonly JournalEvent[],
    files: readonly CheckpointFile[],
    target: string,
  ): Promise<RollbackPlan> {
    const steps = restorePlan(events, files, target);
    return {
      target,
      files: await Promise.all(
        steps.map(async (step): Promise<RollbackFile> => {
          const current = await this.#current(step.path);
          return {
            path: step.path,
            restore: step.restore,
            current,
            conflict: (current?.sha256 ?? null) !== step.expected,
          };
        }),
      ),
    };
  }

  async rollback(op: string, plan: RollbackPlan): Promise<void> {
    for (const file of plan.files) {
      const before = await this.#keep(file.current);
      await this.#put({ op, path: file.path, ...before, after: before.before });
      if (file.restore === null) {
        if (file.current) await this.#store.remove(file.path, file.current.sha256);
      } else {
        const content = await this.#content(file.restore);
        await this.#store.write(file.path, content, file.current?.sha256 ?? null);
      }
      await this.#put({ op, path: file.path, ...before, after: file.restore });
    }
  }

  async prune(events: readonly JournalEvent[]): Promise<string[]> {
    let records = await this.#records();
    const pruned = new Set(
      events.filter((event) => event.type === 'checkpoint_pruned').map((event) => event.run),
    );
    const cleared: string[] = [];
    for (const op of operations(events)) {
      if (keptSize(records) <= CHECKPOINT_LIMIT) break;
      if (pruned.has(op)) continue;
      const gone = records.filter((candidate) => candidate.op === op);
      await withDatabase(async (database) => {
        const transaction = database.transaction('checkpointFiles', 'readwrite');
        for (const record of gone) void transaction.store.delete([record.op, record.path]);
        await transaction.done;
      });
      records = records.filter((record) => record.op !== op);
      cleared.push(op);
    }
    if (cleared.length > 0) await collectGarbage();
    return cleared;
  }

  #records(): Promise<CheckpointFileRecord[]> {
    return withDatabase((database) =>
      database.getAllFromIndex('checkpointFiles', 'project', this.#project),
    );
  }

  async #keep(replaced: ReplacedContent): Promise<{ before: string | null; size: number }> {
    if (!replaced) return { before: null, size: 0 };
    const stored = await withDatabase((database) =>
      database.get('checkpointBlobs', replaced.sha256),
    );
    if (stored) return { before: replaced.sha256, size: stored.gzip.length };
    const compressed = await gzip(replaced.bytes);
    await withDatabase((database) =>
      database.put('checkpointBlobs', { sha256: replaced.sha256, gzip: compressed }),
    );
    return { before: replaced.sha256, size: compressed.length };
  }

  async #content(hash: string): Promise<Uint8Array> {
    const stored = await withDatabase((database) => database.get('checkpointBlobs', hash));
    if (!stored) throw new Error(`The Checkpoint no longer holds the content ${hash}`);
    return gunzip(stored.gzip);
  }

  async #current(path: string): Promise<ReplacedContent> {
    if ((await this.#store.kind(path)) !== 'file') return null;
    const bytes = await this.#store.read(path);
    return { bytes, sha256: await sha256(bytes) };
  }

  async #put(file: CheckpointFile & { size: number }): Promise<void> {
    await withDatabase((database) =>
      database.put('checkpointFiles', { ...file, project: this.#project }),
    );
    this.#changed({ op: file.op, path: file.path, before: file.before, after: file.after });
  }
}

function keptSize(records: readonly CheckpointFileRecord[]): number {
  const sizes = new Map(records.map((record) => [record.before, record.size]));
  sizes.delete(null);
  return [...sizes.values()].reduce((sum, size) => sum + size, 0);
}

function collectGarbage(): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(['checkpointFiles', 'checkpointBlobs'], 'readwrite');
    const records = await transaction.objectStore('checkpointFiles').getAll();
    const referenced = new Set(records.map((record) => record.before));
    const blobs = transaction.objectStore('checkpointBlobs');
    for (const hash of await blobs.getAllKeys()) {
      if (!referenced.has(hash)) void blobs.delete(hash);
    }
    await transaction.done;
  });
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
