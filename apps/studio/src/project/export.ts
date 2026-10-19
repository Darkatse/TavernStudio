import { themeFile } from '@tavern-studio/st-data';
import type { Placement } from '@tavern-studio/workspace';
import { saveFile, type SaveOutcome } from '../lib/save-file';
import { previewSession } from '../preview/session';
import type { Project } from './project';

const SETTINGS = 'default-user/settings.json';
const decoder = new TextDecoder();

/**
 * What a project exports as, read from where its Mounts place it
 * (docs/Architecture.md §6): anything placed into `power_user` makes a theme.
 */
export type ExportKind = 'theme';

export function exportsOf(placements: readonly Placement[]): ExportKind[] {
  const theme = placements.some(
    (placement) =>
      placement.kind === 'value' &&
      placement.path === SETTINGS &&
      placement.pointer[0] === 'power_user',
  );
  return theme ? ['theme'] : [];
}

/**
 * The theme as SillyTavern imports it: `getThemeObject` over the Snapshot's
 * `power_user`, with the fields of the frontend the preview runs, named after
 * the project. Session writes not yet adopted are not part of it.
 */
export function exportTheme(project: Project): Promise<SaveOutcome> {
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
    suggestedName: `${project.record.name}.json`,
    description: 'SillyTavern 主题',
    mimeType: 'application/json',
    extension: '.json',
  });
}
