import { fence, hasDocument } from './documents';
import { formatPointer, isJsonObject, isPrefix, type JsonValue, type Pointer } from './json';
import { MountError, type ProjectManifest } from './manifest';

/** Reads a project lazily: a local folder may hold far more than its Mounts name. */
export interface ProjectReader {
  kind(path: string): Promise<'file' | 'directory' | undefined>;
  read(path: string): Promise<Uint8Array>;
  /** Every file below a directory, as paths relative to it. */
  files(directory: string): Promise<string[]>;
}

export type Placement = FilePlacement | ValuePlacement;

interface PlacementBase {
  /** Index of the Mount in the manifest. */
  mount: number;
  /** The project file the content comes from. */
  source: string;
  /** The data path it goes to. */
  path: string;
}

export interface FilePlacement extends PlacementBase {
  kind: 'file';
  bytes: Uint8Array;
}

export interface ValuePlacement extends PlacementBase {
  kind: 'value';
  pointer: Pointer;
  /**
   * Merged at the pointer as a JSON Merge Patch (RFC 7386): an object sets its
   * keys and leaves the others, anything else replaces the value there.
   */
  patch: JsonValue;
  format: 'json' | 'text';
  fence?: string;
  owned: Pointer[];
}

const decoder = new TextDecoder();

/**
 * Fails with a `MountError` naming the Mount when a source is missing or
 * malformed, or when two Mounts write the same position.
 */
export async function resolveMounts(
  manifest: ProjectManifest,
  project: ProjectReader,
): Promise<Placement[]> {
  const placements = await Promise.all(
    manifest.mounts.map(async (mount, index): Promise<Placement[]> => {
      const where = `Mount ${index + 1} (${mount.from})`;
      const kind = await project.kind(mount.from);
      if (kind === undefined)
        throw new MountError(`${where}: the project has no such file or folder`);
      const base = { mount: index, source: mount.from, path: mount.to.path };

      if (kind === 'directory') {
        if (mount.to.pointer) {
          throw new MountError(`${where}: a folder mounts onto a data folder, not a JSON Pointer`);
        }
        const files = await project.files(mount.from);
        return Promise.all(
          files.map(async (file) => ({
            kind: 'file' as const,
            mount: index,
            source: `${mount.from}/${file}`,
            path: `${mount.to.path}/${file}`,
            bytes: await project.read(`${mount.from}/${file}`),
          })),
        );
      }

      const bytes = await project.read(mount.from);
      const { pointer } = mount.to;
      if (!pointer) return [{ kind: 'file', ...base, bytes }];
      if (!hasDocument(mount.to.path)) {
        throw new MountError(
          `${where}: ${mount.to.path} has no document to point into; only JSON files and character cards do`,
        );
      }
      const format = /\.json$/i.test(mount.from) ? 'json' : 'text';
      if (format === 'json' && mount.fence !== undefined) {
        throw new MountError(`${where}: "fence" wraps text, and this source is JSON`);
      }
      const patch = format === 'json' ? parseSource(where, bytes) : sourceText(bytes, mount.fence);
      return [
        {
          kind: 'value',
          ...base,
          pointer,
          patch,
          format,
          ...(mount.fence === undefined ? {} : { fence: mount.fence }),
          owned: patchedPointers(patch, pointer),
        },
      ];
    }),
  );
  const flat = placements.flat();
  checkConflicts(flat);
  return flat;
}

function parseSource(where: string, bytes: Uint8Array): JsonValue {
  try {
    return JSON.parse(decoder.decode(bytes)) as JsonValue;
  } catch (error) {
    throw new MountError(`${where}: not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

function sourceText(bytes: Uint8Array, language: string | undefined): string {
  const text = decoder.decode(bytes);
  return language === undefined ? text : fence(text, language);
}

function patchedPointers(patch: JsonValue, at: Pointer): Pointer[] {
  if (!isJsonObject(patch)) return [at];
  return Object.entries(patch).flatMap(([key, value]) => patchedPointers(value, [...at, key]));
}

/** Two Mounts writing the same position would make the result depend on their order. */
function checkConflicts(placements: Placement[]): void {
  const conflicts: string[] = [];
  for (const [index, a] of placements.entries()) {
    for (const b of placements.slice(index + 1)) {
      const position = a.mount === b.mount ? undefined : overlap(a, b);
      if (position !== undefined) {
        conflicts.push(`Mounts ${a.mount + 1} and ${b.mount + 1} both write ${position}`);
      }
    }
  }
  if (conflicts.length > 0) throw new MountError(conflicts.join('; '));
}

function overlap(a: Placement, b: Placement): string | undefined {
  if (a.path !== b.path) return undefined;
  if (a.kind === 'file' || b.kind === 'file') return a.path;
  for (const p of a.owned) {
    for (const q of b.owned) {
      if (isPrefix(p, q) || isPrefix(q, p))
        return `${a.path}#${formatPointer(p.length > q.length ? p : q)}`;
    }
  }
  return undefined;
}

/**
 * The value a placement means at one of its owned positions; undefined where
 * the merge patch removes the key.
 */
export function intendedAt(placement: ValuePlacement, owned: Pointer): JsonValue | undefined {
  let value: JsonValue | undefined = placement.patch;
  for (const token of owned.slice(placement.pointer.length)) {
    value = isJsonObject(value) ? value[token] : undefined;
  }
  return owned.length > placement.pointer.length && value === null ? undefined : value;
}
