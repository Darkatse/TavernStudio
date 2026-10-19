import { themeFile } from '@tavern-studio/st-data';
import type { FilePlacement, Placement } from '@tavern-studio/workspace';
import { messagesNow } from '../i18n/messages';
import { saveFile, type SaveOutcome } from '../lib/save-file';
import { previewSession } from '../preview/session';
import { projectMessages } from './messages';
import type { Project } from './project';

const SETTINGS = 'default-user/settings.json';
/** A user's extensions, one folder each; the folder names the extension. */
const EXTENSIONS = 'default-user/extensions/';
const decoder = new TextDecoder();

export type ProjectExport =
  | { kind: 'theme'; placements: Placement[] }
  | { kind: 'extension'; name: string; placements: FilePlacement[] };

export function exportsOf(placements: readonly Placement[]): ProjectExport[] {
  const theme = placements.filter(
    (placement) =>
      placement.kind === 'value' &&
      placement.path === SETTINGS &&
      placement.pointer[0] === 'power_user',
  );
  const extensions = new Map<string, FilePlacement[]>();
  for (const placement of placements) {
    if (placement.kind !== 'file') continue;
    const name = extensionOf(placement.path);
    if (name !== undefined) extensions.set(name, [...(extensions.get(name) ?? []), placement]);
  }
  return [
    ...(theme.length > 0 ? [{ kind: 'theme' as const, placements: theme }] : []),
    ...Array.from(extensions, ([name, files]) => ({
      kind: 'extension' as const,
      name,
      placements: files,
    })),
  ];
}

function extensionOf(path: string): string | undefined {
  if (!path.startsWith(EXTENSIONS)) return undefined;
  const [name, ...rest] = path.slice(EXTENSIONS.length).split('/');
  return rest.length > 0 ? name : undefined;
}

export function exportFileName(project: Project, item: ProjectExport): string {
  return item.kind === 'theme' ? `${project.record.name}.json` : `${item.name}.zip`;
}

/** Call it from the author's click: the save dialog opens only then. */
export function saveExport(project: Project, item: ProjectExport): Promise<SaveOutcome> {
  const fileName = exportFileName(project, item);
  return item.kind === 'theme'
    ? exportTheme(project, fileName)
    : exportExtension(item.name, item.placements, fileName);
}

/**
 * SillyTavern's `getThemeObject` over the Snapshot's `power_user`, with the
 * fields of the frontend the preview runs. Session writes not yet adopted are
 * not part of it.
 */
function exportTheme(project: Project, fileName: string): Promise<SaveOutcome> {
  const anatomy = previewSession.anatomy;
  const settings = previewSession.readSnapshot(SETTINGS);
  if (!anatomy || !settings)
    throw new Error('The preview has not started, so there is nothing to export yet');
  const { power_user: powerUser } = JSON.parse(decoder.decode(settings)) as {
    power_user?: Record<string, unknown>;
  };
  if (!powerUser) throw new Error(`${SETTINGS} has no power_user`);
  const theme = themeFile(project.record.name, powerUser, Object.keys(anatomy.fields));
  // Four spaces, as SillyTavern writes its own theme files.
  const content = new Blob([`${JSON.stringify(theme, null, 4)}\n`], { type: 'application/json' });
  return saveFile(content, {
    suggestedName: fileName,
    description: messagesNow(projectMessages).fileTypes.theme,
    mimeType: 'application/json',
    extension: '.json',
  });
}

/**
 * Neither SillyTavern nor TauriTavern installs an extension from a zip, so
 * the files sit under one top folder named after it: unzipped into
 * `data/default-user/extensions/`, it is that folder. Session writes are not
 * part of it.
 */
async function exportExtension(
  name: string,
  placements: readonly FilePlacement[],
  fileName: string,
): Promise<SaveOutcome> {
  const folder = `${EXTENSIONS}${name}/`;
  const files: Record<string, Uint8Array> = {};
  for (const { path } of placements) {
    const bytes = previewSession.readSnapshot(path);
    if (!bytes) throw new Error(`The Snapshot has no ${path}`);
    files[`${name}/${path.slice(folder.length)}`] = bytes;
  }
  const { zipFiles } = await import('../lib/zip');
  return saveFile(await zipFiles(files), {
    suggestedName: fileName,
    description: messagesNow(projectMessages).fileTypes.extension,
    mimeType: 'application/zip',
    extension: '.zip',
  });
}
