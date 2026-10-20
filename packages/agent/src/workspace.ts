import { sha256, StaleFileError } from '@tavern-studio/workspace';
import { globMatcher } from './glob';
import { modelToolName, ToolError } from './tool';

export interface WorkspaceRoot {
  kind(path: string): Promise<'file' | 'directory' | undefined>;
  read(path: string): Promise<Uint8Array>;
  /** Every file below a directory, as paths relative to it; `''` is the root. */
  files(directory: string): Promise<string[]>;
  /**
   * Present on writable roots. With `expected`, writes only if the file's
   * SHA-256 (hex) still is that, or, for null, if the file does not exist;
   * otherwise rejects with `StaleFileError`. Resolves to the new SHA-256.
   */
  write?(path: string, content: Uint8Array, expected?: string | null): Promise<string>;
}

/**
 * The roots by name, as the Agent's paths begin: `project/theme.css`. Listing
 * and searching take them in this order.
 */
export type AgentWorkspace = Readonly<Record<string, WorkspaceRoot>>;

export const TOOL_RESULTS_ROOT = 'tool-results';

export const LIST_FILES = 'workspace.list_files';
export const GREP = 'workspace.grep';
export const READ_FILE = 'workspace.read_file';
export const WRITE_FILE = 'workspace.write_file';
export const EDIT_FILE = 'workspace.edit_file';

/** Normalizes a path as TauriTavern's `WorkspacePath::parse` does. */
export function parseWorkspacePath(raw: string, code = 'workspace.invalid_path'): string {
  const refuse = (reason: string) => new ToolError(code, `Invalid data: Workspace path ${reason}`);
  if (raw === '') throw refuse('cannot be empty');
  if (raw.includes('\0')) throw refuse('cannot contain NUL');
  if (raw.startsWith('/') || raw.startsWith('\\')) throw refuse('must be relative');
  if (/^[A-Za-z]:/.test(raw)) throw refuse('cannot use a Windows drive prefix');
  const segments = raw
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) throw refuse('cannot contain ..');
  if (segments.length === 0) throw refuse('cannot be empty');
  return segments.join('/');
}

/** `relative` is `''` for the root itself. */
export interface Location {
  path: string;
  root: WorkspaceRoot;
  relative: string;
}

export interface WritableLocation extends Location {
  root: Required<WorkspaceRoot>;
}

function locate(workspace: AgentWorkspace, path: string): Location | undefined {
  const slash = path.indexOf('/');
  const name = slash === -1 ? path : path.slice(0, slash);
  const root = Object.hasOwn(workspace, name) ? workspace[name] : undefined;
  return root && { path, root, relative: slash === -1 ? '' : path.slice(slash + 1) };
}

export function visibleLocation(workspace: AgentWorkspace, path: string): Location {
  const location = locate(workspace, path);
  if (!location) {
    throw new ToolError(
      'workspace.path_not_visible',
      `Permission denied: \`${path}\` is not readable for this task.`,
    );
  }
  return location;
}

export function writableLocation(workspace: AgentWorkspace, path: string): WritableLocation {
  const location = locate(workspace, path);
  if (!location || location.relative === '' || !isWritable(location.root)) {
    throw new ToolError(
      'workspace.path_not_writable',
      `Permission denied: \`${path}\` is not writable for this task.`,
    );
  }
  return { path, root: location.root, relative: location.relative };
}

function isWritable(root: WorkspaceRoot): root is Required<WorkspaceRoot> {
  return root.write !== undefined;
}

export function kindAt(location: Location): Promise<'file' | 'directory' | undefined> {
  return location.relative === ''
    ? Promise.resolve('directory')
    : location.root.kind(location.relative);
}

export interface TextFile {
  path: string;
  text: string;
  bytes: number;
  /** SHA-256 (hex) of its bytes. */
  sha256: string;
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

export async function readText(location: Location): Promise<TextFile> {
  const kind = await kindAt(location);
  if (kind === undefined) {
    throw new ToolError(
      'workspace.file_not_found',
      `read ${location.path}: No such file or directory`,
    );
  }
  if (kind === 'directory') throw pathIsDirectory(location.path);
  const file = await textAt(location);
  if (!file) {
    throw new ToolError('workspace.file_not_text', `\`${location.path}\` is not UTF-8 text.`);
  }
  return file;
}

/** An existing file's text, or undefined when it is not UTF-8. */
export async function textAt(location: Location): Promise<TextFile | undefined> {
  const bytes = await location.root.read(location.relative);
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
  return { path: location.path, text, bytes: bytes.length, sha256: await sha256(bytes) };
}

export type WriteConflict = 'exists' | 'changed' | 'missing';

/** The tools write only through here. */
export async function writeText(
  location: WritableLocation,
  text: string,
  expected: string | null,
): Promise<TextFile | WriteConflict> {
  const bytes = encoder.encode(text);
  try {
    const hash = await location.root.write(location.relative, bytes, expected);
    return { path: location.path, text, bytes: bytes.length, sha256: hash };
  } catch (error) {
    if (!(error instanceof StaleFileError)) throw error;
    if (expected === null) return 'exists';
    return (await location.root.kind(location.relative)) === undefined ? 'missing' : 'changed';
  }
}

export function pathIsDirectory(path: string): ToolError {
  return new ToolError(
    'workspace.path_is_directory',
    `workspace path \`${path}\` is a directory; call ${modelToolName(LIST_FILES)} to list its contents and re-target a specific file.`,
  );
}

export interface Entry {
  path: string;
  kind: 'file' | 'directory';
}

export interface EntryList {
  entries: Entry[];
  truncated: boolean;
}

/**
 * Walks as TauriTavern's `list_files` does: a directory's children are all
 * taken before any is entered. The result is in path order.
 */
export async function listEntries(
  workspace: AgentWorkspace,
  location: Location | undefined,
  depth: number,
  maxEntries: number,
): Promise<EntryList> {
  // A root lists every file below a directory in one call, so the walk loads
  // the tree below where it starts, or below each root it enters, at once.
  const tree = new Map<string, Map<string, Entry['kind']>>();
  const loaded = new Set<string>();
  const load = async ({ path, root, relative }: Location) => {
    loaded.add(path);
    for (const file of await root.files(relative)) {
      const segments = file.split('/');
      let parent = path;
      for (const [index, segment] of segments.entries()) {
        const child = `${parent}/${segment}`;
        const children = tree.get(parent) ?? new Map<string, Entry['kind']>();
        tree.set(parent, children.set(child, index === segments.length - 1 ? 'file' : 'directory'));
        parent = child;
      }
    }
  };
  const childrenOf = async (directory: string | undefined): Promise<Entry[]> => {
    if (directory === undefined) {
      return Object.keys(workspace).map((path): Entry => ({ path, kind: 'directory' }));
    }
    if (!directory.includes('/') && !loaded.has(directory)) {
      await load(visibleLocation(workspace, directory));
    }
    const children = tree.get(directory);
    if (!children) return [];
    return Array.from(children, ([path, kind]): Entry => ({ path, kind })).toSorted((a, b) =>
      comparePaths(a.path, b.path),
    );
  };

  if (location) {
    const kind = await kindAt(location);
    if (kind === undefined) throw pathNotFound(location.path);
    if (kind === 'file') {
      return { entries: [{ path: location.path, kind: 'file' }], truncated: false };
    }
    await load(location);
  }
  const pending: [string | undefined, number][] = [[location?.path, 0]];
  const entries: Entry[] = [];
  let truncated = false;
  for (let next = pending.pop(); next !== undefined && !truncated; next = pending.pop()) {
    const [directory, level] = next;
    for (const entry of (await childrenOf(directory)).toReversed()) {
      if (entries.length === maxEntries) {
        truncated = true;
        break;
      }
      if (entry.kind === 'directory' && level < depth) pending.push([entry.path, level + 1]);
      entries.push(entry);
    }
  }
  const order = rootOrder(workspace);
  entries.sort((a, b) => order(a.path, b.path));
  return { entries, truncated };
}

/** Roots in the workspace's order, and paths within a root by `comparePaths`. */
function rootOrder(workspace: AgentWorkspace): (a: string, b: string) => number {
  const roots = Object.keys(workspace);
  const index = (path: string) => roots.indexOf(path.split('/', 1)[0]!);
  return (a, b) => index(a) - index(b) || comparePaths(a, b);
}

export interface FileList {
  files: Location[];
  /** More than the asked-for number of files are there. */
  truncated: boolean;
}

/**
 * Every file below `location`, or below each root when it is undefined, in
 * path order. A glob is matched against the path below `location`, or the
 * whole path when there is none.
 */
export async function filesBelow(
  workspace: AgentWorkspace,
  location: Location | undefined,
  glob: string | undefined,
  max: number,
): Promise<FileList> {
  const matches = glob === undefined ? () => true : globMatcher(glob);
  const starts = location
    ? [location]
    : Object.keys(workspace).map((root) => visibleLocation(workspace, root));
  const files: Location[] = [];
  for (const start of starts) {
    const kind = await kindAt(start);
    if (kind === undefined) throw pathNotFound(start.path);
    if (kind === 'file') {
      if (matches(start.path.slice(start.path.lastIndexOf('/') + 1))) files.push(start);
      continue;
    }
    for (const below of (await start.root.files(start.relative)).toSorted(comparePaths)) {
      const path = `${start.path}/${below}`;
      if (!matches(location ? below : path)) continue;
      if (files.length === max) return { files, truncated: true };
      const relative = start.relative === '' ? below : `${start.relative}/${below}`;
      files.push({ path, root: start.root, relative });
    }
  }
  return { files, truncated: false };
}

function pathNotFound(path: string): ToolError {
  return new ToolError('workspace.path_not_found', `stat ${path}: No such file or directory`);
}

/**
 * Segment by segment, each in code-unit order, so a directory's contents
 * follow it: `jsr/`, `jsr/a.d.ts`, `jsr-docs/`.
 */
function comparePaths(a: string, b: string): number {
  const x = a.split('/');
  const y = b.split('/');
  for (let index = 0; index < Math.min(x.length, y.length); index++) {
    if (x[index] !== y[index]) return x[index]! < y[index]! ? -1 : 1;
  }
  return x.length - y.length;
}
