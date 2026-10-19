import { ProjectStore } from '@tavern-studio/workspace';
import { previewSession } from '../preview/session';
import { loadTemplate } from '../preview/sources';
import { db, type ProjectRecord } from '../storage/db';
import { Project } from './project';

/** The fixture the preview shows while no project is open. */
const DEFAULT_FIXTURE = 'showcase';

let current: Project | undefined;
const listeners = new Set<() => void>();
let started: Promise<void> | undefined;

/** The open project, if any. */
export function currentProject(): Project | undefined {
  return current;
}

export function subscribeProject(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Opens the preview once: on the project opened last, or on the default
 * fixture with nothing mounted. Asks the browser to keep Studio's storage,
 * since projects live in it (docs/Architecture.md §7).
 */
export function startStudio(): Promise<void> {
  started ??= (async () => {
    void navigator.storage.persist();
    const last = await db.projects.orderBy('openedAt').last();
    if (last) await openProject(last);
    else await previewSession.open(DEFAULT_FIXTURE, []);
  })();
  return started;
}

/** Creates a project in OPFS from a template's files. */
export async function createProject(template: string, name: string): Promise<ProjectRecord> {
  const id = crypto.randomUUID();
  const store = new ProjectStore(await projectDirectory(id));
  const { files } = await loadTemplate(template);
  for (const [path, bytes] of files) await store.write(path, bytes);
  const now = Date.now();
  const record: ProjectRecord = { id, name, template, createdAt: now, openedAt: now };
  await db.projects.add(record);
  return record;
}

/** Opens a project in the preview, closing the one open before. */
export async function openProject(record: ProjectRecord): Promise<void> {
  current?.close();
  const project = new Project(record, new ProjectStore(await projectDirectory(record.id)));
  current = project;
  for (const listener of listeners) listener();
  await db.projects.update(record.id, { openedAt: Date.now() });
  await project.start();
}

/** A project's folder in OPFS: `projects/<id>/`. */
async function projectDirectory(id: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle('projects', { create: true });
  return projects.getDirectoryHandle(id, { create: true });
}
