import { ProjectStore } from '@tavern-studio/workspace';
import { messagesNow } from '../i18n/messages';
import { previewSession } from '../preview/session';
import { loadTemplate } from '../preview/sources';
import { withDatabase, type ProjectRecord } from '../storage/db';
import { projectMessages } from './messages';
import { Project } from './project';
import type { ProjectTemplate } from './templates';

const DEFAULT_FIXTURE = 'showcase';

let current: Project | undefined;
/** Until Studio has reopened the last project or found none, having none says nothing yet. */
let restored = false;
/** Every project, the one opened last first. */
let records: readonly ProjectRecord[] = [];
const listeners = new Set<() => void>();
let started: Promise<void> | undefined;

export function currentProject(): Project | undefined {
  return current;
}

export function projectRestored(): boolean {
  return restored;
}

export function projectRecords(): readonly ProjectRecord[] {
  return records;
}

export function subscribeProject(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The tab takes the Session first, and asks the browser to keep Studio's
 * storage, since projects live in it.
 */
export function startStudio(): Promise<void> {
  started ??= (async () => {
    void navigator.storage.persist();
    await previewSession.own();
    await refreshRecords();
    const [last] = records;
    if (last) {
      await openProject(last);
      return;
    }
    restored = true;
    notify();
    await previewSession.open(DEFAULT_FIXTURE, []);
  })();
  return started;
}

export async function createFromTemplate(template: ProjectTemplate): Promise<ProjectRecord> {
  const { files } = await loadTemplate(template.folder);
  const { name } = messagesNow(projectMessages).templates[template.folder];
  return createProject(name, template.folder, files);
}

/**
 * The files are a template's or an archive's, and `origin` records which.
 * The caller has checked the paths.
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
  await withDatabase((database) => database.add('projects', record));
  await refreshRecords();
  return record;
}

export async function openProject(record: ProjectRecord): Promise<void> {
  current?.close();
  const opened = { ...record, openedAt: Date.now() };
  const project = new Project(opened, new ProjectStore(await projectDirectory(record.id)));
  current = project;
  restored = true;
  notify();
  await withDatabase((database) => database.put('projects', opened));
  await refreshRecords();
  await project.start();
}

export type ProjectNameProblem = 'empty' | 'taken';

/** A name is used trimmed, and no two projects share one. */
export function projectNameProblem(
  name: string,
  self: ProjectRecord,
): ProjectNameProblem | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  const taken = records.some((record) => record.id !== self.id && record.name === trimmed);
  return taken ? 'taken' : undefined;
}

/** The caller has checked the name with `projectNameProblem`. */
export async function renameProject(record: ProjectRecord, name: string): Promise<void> {
  const problem = projectNameProblem(name, record);
  if (problem) throw new Error(`Can't rename project ${record.id}: the name is ${problem}`);
  const renamed = await withDatabase(async (database) => {
    const tx = database.transaction('projects', 'readwrite');
    const stored = await tx.store.get(record.id);
    if (!stored) throw new Error(`Project ${record.id} is not stored`);
    const named = { ...stored, name: name.trim() };
    await Promise.all([tx.store.put(named), tx.done]);
    return named;
  });
  if (current?.record.id === record.id) current.record = renamed;
  await refreshRecords();
}

async function refreshRecords(): Promise<void> {
  const stored = await withDatabase((database) => database.getAllFromIndex('projects', 'openedAt'));
  records = stored.toReversed();
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

async function projectDirectory(id: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle('projects', { create: true });
  return projects.getDirectoryHandle(id, { create: true });
}
