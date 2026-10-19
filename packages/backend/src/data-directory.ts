export interface FileStat {
  size: number;
  modified: number;
}

interface Entry {
  bytes: Uint8Array;
  modified: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Paths are POSIX paths relative to the data root, for example
 * `default-user/settings.json`.
 */
export class DataDirectory {
  readonly #files = new Map<string, Entry>();
  readonly #listeners = new Set<(path: string) => void>();

  constructor(files: Iterable<readonly [string, Uint8Array]>, modified = Date.now()) {
    for (const [path, bytes] of files) this.#files.set(path, { bytes, modified });
  }

  has(path: string): boolean {
    return this.#files.has(path);
  }

  read(path: string): Uint8Array | undefined {
    return this.#files.get(path)?.bytes;
  }

  readText(path: string): string | undefined {
    const bytes = this.read(path);
    return bytes && decoder.decode(bytes);
  }

  stat(path: string): FileStat | undefined {
    const entry = this.#files.get(path);
    return entry && { size: entry.bytes.length, modified: entry.modified };
  }

  /** Names of the files directly inside `dir`. */
  files(dir: string): string[] {
    return this.#children(dir)
      .filter((child) => !child.isDirectory)
      .map((child) => child.name);
  }

  /** Names of the directories directly inside `dir`. */
  directories(dir: string): string[] {
    return this.#children(dir)
      .filter((child) => child.isDirectory)
      .map((child) => child.name);
  }

  paths(): IterableIterator<string> {
    return this.#files.keys();
  }

  write(path: string, content: Uint8Array | string): void {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    this.#files.set(path, { bytes, modified: Date.now() });
    for (const listener of this.#listeners) listener(path);
  }

  delete(path: string): void {
    if (!this.#files.delete(path)) return;
    for (const listener of this.#listeners) listener(path);
  }

  onChange(listener: (path: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #children(dir: string): { name: string; isDirectory: boolean }[] {
    const prefix = `${dir}/`;
    const seen = new Map<string, boolean>();
    for (const path of this.#files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      const name = slash === -1 ? rest : rest.slice(0, slash);
      seen.set(name, slash !== -1 || seen.get(name) === true);
    }
    return [...seen].map(([name, isDirectory]) => ({ name, isDirectory }));
  }
}
