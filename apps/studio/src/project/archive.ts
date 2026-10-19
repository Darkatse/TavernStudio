import { isRelativePath, MANIFEST } from '@tavern-studio/workspace';
import type { Unzipped, Zippable } from 'fflate';
import { messagesNow } from '../i18n/messages';
import { saveFile, type SaveOutcome } from '../lib/save-file';
import type { ProjectRecord } from '../storage/db';
import { projectMessages } from './messages';
import type { Project } from './project';
import { createProject } from './projects';

/** The longest path an archive may hold, as PureTavern limits it. */
const MAX_PATH = 500;

export type ArchiveReason =
  | { kind: 'notZip'; detail: string }
  | { kind: 'notProject' }
  | { kind: 'unsafePaths'; paths: readonly string[] }
  | { kind: 'caseClash'; pairs: readonly (readonly [string, string])[] };

export class ArchiveError extends Error {
  override name = 'ArchiveError';
  readonly reason: ArchiveReason;

  constructor(reason: ArchiveReason) {
    super(`The archive cannot become a project: ${JSON.stringify(reason)}`);
    this.reason = reason;
  }
}

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
 * Checked before anything is written. No two paths may differ only in case,
 * since they would be one file on Windows and macOS.
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
