import { isRelativePath, MANIFEST } from '@tavern-studio/workspace';
import type { Unzipped, Zippable } from 'fflate';
import { messagesNow } from '../i18n/messages';
import { saveFile, type SaveOutcome } from '../lib/save-file';
import type { ProjectRecord } from '../storage/db';
import { projectMessages } from './messages';
import type { Project } from './project';
import { createProject } from './projects';

/**
 * A project as a zip of its files at their paths (docs/Architecture.md §6, 归档).
 * The zip library loads when the author exports or imports, so it stays off
 * Studio's first screen.
 */

/** The longest path an archive may hold, as PureTavern limits it. */
const MAX_PATH = 500;

/** Why an archive cannot become a project, as data the interface words for the author. */
export type ArchiveReason =
  /** The file is no zip; `detail` is the zip library's own words. */
  | { kind: 'notZip'; detail: string }
  /** The zip holds no studio.json, at its root or in its one top folder. */
  | { kind: 'notProject' }
  /** Paths that leave the project or that no file system takes. */
  | { kind: 'unsafePaths'; paths: readonly string[] }
  /** Paths that differ only in case: one file on Windows and macOS. */
  | { kind: 'caseClash'; pairs: readonly (readonly [string, string])[] };

export class ArchiveError extends Error {
  override name = 'ArchiveError';
  readonly reason: ArchiveReason;

  constructor(reason: ArchiveReason) {
    super(`The archive cannot become a project: ${JSON.stringify(reason)}`);
    this.reason = reason;
  }
}

/** Saves the project's files as a zip the author can keep, share or import again. */
export async function exportArchive(project: Project): Promise<SaveOutcome> {
  const files: Zippable = {};
  for (const path of await project.store.files('')) files[path] = await project.store.read(path);
  const { zipFiles } = await import('../lib/zip');
  return saveFile(await zipFiles(files), {
    suggestedName: `${project.record.name}.zip`,
    description: messagesNow(projectMessages).fileTypes.project,
    mimeType: 'application/zip',
    extension: '.zip',
  });
}

/** Creates a project from an archive, named after its file. */
export async function importArchive(file: File): Promise<ProjectRecord> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { unzipFiles } = await import('../lib/zip');
  const entries = await unzipFiles(bytes).catch((error: unknown) => {
    throw new ArchiveError({
      kind: 'notZip',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
  return createProject(file.name.replace(/\.zip$/i, ''), 'archive', projectFiles(entries));
}

/**
 * The project's files in an archive, checked before anything is written:
 * every path stays inside the project, and no two differ only in case, since
 * they would be one file on Windows and macOS.
 */
function projectFiles(entries: Unzipped): [string, Uint8Array][] {
  // Folders come as entries ending in a slash, and macOS adds __MACOSX/ beside the files.
  let files = Object.entries(entries).filter(
    ([path]) => !path.endsWith('/') && !path.startsWith('__MACOSX/'),
  );
  if (!files.some(([path]) => path === MANIFEST)) {
    // A folder compressed whole puts everything in one top folder; the project is inside it.
    const tops = new Set(files.map(([path]) => path.split('/', 1)[0]));
    const [top] = tops;
    if (tops.size !== 1 || !files.some(([path]) => path === `${top}/${MANIFEST}`)) {
      throw new ArchiveError({ kind: 'notProject' });
    }
    files = files.map(([path, content]) => [path.slice(`${top}/`.length), content]);
  }

  const unsafe = files
    .map(([path]) => path)
    .filter((path) => !isRelativePath(path) || path.length > MAX_PATH);
  if (unsafe.length > 0) throw new ArchiveError({ kind: 'unsafePaths', paths: unsafe });
  const seen = new Map<string, string>();
  const clashes: [string, string][] = [];
  for (const [path] of files) {
    const folded = path.normalize('NFC').toLowerCase();
    const other = seen.get(folded);
    if (other === undefined) seen.set(folded, path);
    else clashes.push([other, path]);
  }
  if (clashes.length > 0) throw new ArchiveError({ kind: 'caseClash', pairs: clashes });
  return files;
}
