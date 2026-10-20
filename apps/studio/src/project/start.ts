import { useSyncExternalStore } from 'react';
import { messagesNow } from '../i18n/messages';
import { showToast } from '../ui/toast';
import { projectMessages } from './messages';
import { createFromTemplate, openProject } from './projects';
import type { ProjectTemplate } from './templates';

let starting: ProjectTemplate['folder'] | undefined;
const listeners = new Set<() => void>();

/**
 * Every entry that starts a project from a template goes through here, so
 * one start runs at a time and a failure reads the same wherever it began.
 */
export async function startProject(template: ProjectTemplate): Promise<void> {
  if (starting) return;
  setStarting(template.folder);
  try {
    await openProject(await createFromTemplate(template));
  } catch (error) {
    showToast({
      kind: 'error',
      title: messagesNow(projectMessages).createFailed,
      description: error instanceof Error ? error.message : String(error),
    });
  } finally {
    setStarting(undefined);
  }
}

/** The template a project is being started from, if one is. */
export function useStartingProject(): ProjectTemplate['folder'] | undefined {
  return useSyncExternalStore(subscribe, () => starting);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStarting(folder: ProjectTemplate['folder'] | undefined): void {
  starting = folder;
  for (const listener of listeners) listener();
}
