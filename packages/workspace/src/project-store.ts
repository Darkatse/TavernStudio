import { isRelativePath } from './manifest';
import type { ProjectReader } from './placements';

/** The file changed since it was read: the write was refused (compare-and-swap). */
export class StaleFileError extends Error {
  override name = 'StaleFileError';
}

/** The content a write replaces, with its SHA-256 (hex); null when there was no file. */
export type ReplacedContent = { bytes: Uint8Array; sha256: string } | null;

/**
 * A project's files under one directory handle. OPFS and a local folder opened
 * through File System Access are both a `FileSystemDirectoryHandle`, so this is
 * the only project store (docs/Architecture.md §6).
 *
 * Operations run one at a time, so a compare-and-swap reads and writes with no
 * other write in between, as TauriTavern's workspace does under its write lock.
 */
export class ProjectStore implements ProjectReader {
  readonly #root: FileSystemDirectoryHandle;
  readonly #listeners = new Set<(paths: readonly string[]) => void>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(root: FileSystemDirectoryHandle) {
    this.#root = root;
  }

  kind(path: string): Promise<'file' | 'directory' | undefined> {
    return this.#exclusive(async () => {
      const parent = await this.#directory(parentOf(path), false);
      if (!parent) return undefined;
      for await (const [name, handle] of parent.entries()) {
        if (name === nameOf(path)) return handle.kind;
      }
      return undefined;
    });
  }

  read(path: string): Promise<Uint8Array> {
    return this.#exclusive(() => this.#read(path));
  }

  /** Every file below a directory, as paths relative to it, in name order. */
  files(directory: string): Promise<string[]> {
    return this.#exclusive(async () => {
      const root = await this.#directory(directory, false);
      if (!root) throw new Error(`The project has no folder ${directory}`);
      return (await listFiles(root, '')).toSorted();
    });
  }

  /**
   * Writes a file, creating its folders. With `expected`, the write happens
   * only if the file's content still has that SHA-256 (hex), or, for null,
   * if the file does not exist yet. `keep` receives the content the write
   * replaces, from the same read as that check, and the write waits for it:
   * a Checkpoint saves the original this way (docs/Agent.md §1). Resolves to
   * the new content's SHA-256.
   */
  write(
    path: string,
    content: Uint8Array,
    expected?: string | null,
    keep?: (replaced: ReplacedContent) => Promise<void>,
  ): Promise<string> {
    return this.#exclusive(async () => {
      if (expected !== undefined || keep) {
        const replaced = await this.#current(path);
        if (expected !== undefined) checkExpected(path, replaced, expected);
        await keep?.(replaced);
      }
      const directory = await this.#directory(parentOf(path), true);
      const handle = await directory.getFileHandle(nameOf(path), { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(content));
      await writable.close();
      this.#notify([path]);
      return sha256(content);
    });
  }

  /** Removes a file; with `expected`, only if its content still has that SHA-256. */
  remove(path: string, expected?: string): Promise<void> {
    return this.#exclusive(async () => {
      if (expected !== undefined) checkExpected(path, await this.#current(path), expected);
      const directory = await this.#directory(parentOf(path), false);
      if (!directory) throw new Error(`The project has no file ${path}`);
      await directory.removeEntry(nameOf(path));
      this.#notify([path]);
    });
  }

  /** Listens for changes this store makes. */
  subscribe(listener: (paths: readonly string[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async #current(path: string): Promise<ReplacedContent> {
    try {
      const bytes = await this.#read(path);
      return { bytes, sha256: await sha256(bytes) };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async #read(path: string): Promise<Uint8Array> {
    checkPath(path);
    const directory = await this.#directory(parentOf(path), false);
    if (!directory) throw new DOMException(`The project has no file ${path}`, 'NotFoundError');
    const file = await (await directory.getFileHandle(nameOf(path))).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async #directory(path: string, create: true): Promise<FileSystemDirectoryHandle>;
  async #directory(path: string, create: false): Promise<FileSystemDirectoryHandle | undefined>;
  async #directory(path: string, create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
    let directory = this.#root;
    if (path === '') return directory;
    checkPath(path);
    for (const segment of path.split('/')) {
      try {
        directory = await directory.getDirectoryHandle(segment, { create });
      } catch (error) {
        if (!create && error instanceof DOMException && error.name === 'NotFoundError')
          return undefined;
        throw error;
      }
    }
    return directory;
  }

  #notify(paths: readonly string[]): void {
    for (const listener of this.#listeners) listener(paths);
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}

async function listFiles(directory: FileSystemDirectoryHandle, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === 'file') files.push(prefix + name);
    else files.push(...(await listFiles(handle, `${prefix}${name}/`)));
  }
  return files;
}

function checkExpected(path: string, current: ReplacedContent, expected: string | null): void {
  const actual = current?.sha256 ?? null;
  if (actual === expected) return;
  throw new StaleFileError(
    actual === null ? `${path} no longer exists` : `${path} changed since it was read`,
  );
}

function checkPath(path: string): void {
  if (!isRelativePath(path)) throw new Error(`"${path}" is not a path inside the project`);
}

function parentOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
