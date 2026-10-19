import { ProjectStore } from '@tavern-studio/workspace';
import { previewSession } from '../preview/session';
import { loadTemplate } from '../preview/sources';
import { db, type ProjectRecord } from '../storage/db';
import { Project } from './project';
import type { ProjectTemplate } from './templates';

/** The fixture the preview shows while no project is open. */
const DEFAULT_FIXTURE = 'showcase';

let current: Project | undefined;
/** Every project, the one opened last first. */
let records: readonly ProjectRecord[] = [];
const listeners = new Set<() => void>();
let started: Promise<void> | undefined;

/** The open project, if any. */
export function currentProject(): Project | undefined {
  return current;
}

export function projectRecords(): readonly ProjectRecord[] {
  return records;
}

/** Listens for the open project or the list of projects to change. */
export function subscribeProject(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Opens the preview once: on the project opened last, or on the default
 * fixture with nothing mounted. The tab takes the Session first, and asks the
 * browser to keep Studio's storage, since projects live in it
 * (docs/Architecture.md §4, §7).
 */
export function startStudio(): Promise<void> {
  started ??= (async () => {
    void navigator.storage.persist();
    await previewSession.own();
    await refreshRecords();
    const [last] = records;
    if (last) await openProject(last);
    else await previewSession.open(DEFAULT_FIXTURE, []);
  })();
  return started;
}

/** A project from a template's files, named as the template names a new one. */
export async function createFromTemplate(template: ProjectTemplate): Promise<ProjectRecord> {
  const { files } = await loadTemplate(template.folder);
  return createProject(template.name, template.folder, files);
}

/**
 * Creates a project in OPFS from files, a template's or an archive's;
 * `origin` records which. The caller has checked the paths. A name another
 * project has gets a number, so the list tells them apart.
 */
export async function createProject(
  name: string,
  origin: string,
  files: readonly (readonly [path: string, content: Uint8Array])[],
): Promise<ProjectRecord> {
  const id = crypto.randomUUID();
  const store = new ProjectStore(await projectDirectory(id));
  for (const [path, bytes] of files) await store.write(path, bytes);
  const now = Date.now();
  const taken = new Set(records.map((record) => record.name));
  let unique = name;
  for (let number = 2; taken.has(unique); number++) unique = `${name} ${number}`;
  const record: ProjectRecord = { id, name: unique, origin, createdAt: now, openedAt: now };
  await (await db).add('projects', record);
  await refreshRecords();
  return record;
}

/** Opens a project in the preview, closing the one open before. */
export async function openProject(record: ProjectRecord): Promise<void> {
  current?.close();
  const project = new Project(record, new ProjectStore(await projectDirectory(record.id)));
  current = project;
  notify();
  await (await db).put('projects', { ...record, openedAt: Date.now() });
  await refreshRecords();
  await project.start();
}

async function refreshRecords(): Promise<void> {
  const stored = await (await db).getAllFromIndex('projects', 'openedAt');
  records = stored.toReversed();
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** A project's folder in OPFS: `projects/<id>/`. */
async function projectDirectory(id: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle('projects', { create: true });
  return projects.getDirectoryHandle(id, { create: true });
}
