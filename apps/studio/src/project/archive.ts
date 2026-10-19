import { isRelativePath, MANIFEST } from '@tavern-studio/workspace';
import { unzip, type Unzipped, type Zippable } from 'fflate';
import { saveFile, type SaveOutcome } from '../lib/save-file';
import { zipFiles } from '../lib/zip';
import type { ProjectRecord } from '../storage/db';
import type { Project } from './project';
import { createProject } from './projects';

/**
 * A project as a zip of its files at their paths (docs/Architecture.md §6, 归档).
 * This module loads when the author exports or imports, so the zip library
 * stays off Studio's first screen.
 */

/** The longest path an archive may hold, as PureTavern limits it. */
const MAX_PATH = 500;

/** Why an archive cannot become a project, in the author's terms. */
export class ArchiveError extends Error {
  override name = 'ArchiveError';
}

/** Saves the project's files as a zip the author can keep, share or import again. */
export async function exportArchive(project: Project): Promise<SaveOutcome> {
  const files: Zippable = {};
  for (const path of await project.store.files('')) files[path] = await project.store.read(path);
  return saveFile(await zipFiles(files), {
    suggestedName: `${project.record.name}.zip`,
    description: 'Studio 项目',
    mimeType: 'application/zip',
    extension: '.zip',
  });
}

/** Creates a project from an archive, named after its file. */
export async function importArchive(file: File): Promise<ProjectRecord> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Unzipped>((resolve, reject) => {
    unzip(bytes, (error, data) =>
      error ? reject(new ArchiveError(`这个文件不是能读的 zip：${error.message}`)) : resolve(data),
    );
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
      throw new ArchiveError(`这个 zip 里没有 ${MANIFEST}，不是 Studio 项目。`);
    }
    files = files.map(([path, content]) => [path.slice(`${top}/`.length), content]);
  }

  const unsafe = files
    .map(([path]) => path)
    .filter((path) => !isRelativePath(path) || path.length > MAX_PATH);
  if (unsafe.length > 0) {
    throw new ArchiveError(`这些路径会落到项目之外或无法使用：${list(unsafe)}`);
  }
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const [path] of files) {
    const folded = path.normalize('NFC').toLowerCase();
    const other = seen.get(folded);
    if (other === undefined) seen.set(folded, path);
    else clashes.push(`${other} 与 ${path}`);
  }
  if (clashes.length > 0) {
    throw new ArchiveError(
      `这些文件名只有大小写不同，在 Windows 和 macOS 上是同一个文件：${list(clashes)}`,
    );
  }
  return files;
}

function list(items: readonly string[]): string {
  const shown = items.slice(0, 5).join('；');
  return items.length > 5 ? `${shown}，另有 ${items.length - 5} 处` : shown;
}
