import type { HistoryEntry, JournalEvent } from '@tavern-studio/agent';
import type { Placement } from '@tavern-studio/workspace';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** Studio's one IndexedDB database (docs/Architecture.md §7). */
export const DATABASE = 'tavern-studio';

export interface ProjectRecord {
  id: string;
  name: string;
  /** The template the project started from. */
  template: string;
  createdAt: number;
  openedAt: number;
}

/**
 * The persisted Session (docs/Architecture.md §7): what it was opened on, and
 * the placements its data reflects, so that reopening can move from those to
 * the project's current ones.
 */
export interface SessionRecord {
  id: 'session';
  fixture: string;
  vendor: string;
  placements: readonly Placement[];
  /** The Web Host's own document (docs/Vendors.md §3). */
  webHost: Record<string, unknown> | null;
}

/** A data file where the Session differs from the fixture: its content, or null when deleted. */
export interface SessionFile {
  path: string;
  content: Uint8Array | null;
}

/** A History entry of a project's conversation with the Agent, in order (docs/Agent.md §1). */
export interface HistoryRecord extends HistoryEntry {
  seq?: number;
  project: string;
}

/** A Journal event of a project's conversation, in order. */
export interface JournalRecord {
  seq?: number;
  project: string;
  event: JournalEvent;
}

/** A long tool result, read back through the Agent's `tool-results/` root. */
export interface ToolResultRecord {
  /** Its path inside `tool-results/`: `<run>/round-NNN-call_<hash>.txt`. */
  path: string;
  project: string;
  text: string;
}

/** A preference, such as the Agent's model endpoints. */
export interface PreferenceRecord {
  key: string;
  value: unknown;
}

interface StudioSchema extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { openedAt: number } };
  session: { key: string; value: SessionRecord };
  sessionFiles: { key: string; value: SessionFile };
  history: { key: number; value: HistoryRecord; indexes: { project: string } };
  journal: { key: number; value: JournalRecord; indexes: { project: string } };
  toolResults: { key: string; value: ToolResultRecord; indexes: { project: string } };
  preferences: { key: string; value: PreferenceRecord };
}

export type StudioDatabase = IDBPDatabase<StudioSchema>;

/**
 * The database, opened once. Studio's state lives in memory and reaches the
 * interface through its own stores, so a thin promise wrapper is all that
 * IndexedDB needs here (docs/Decisions.md).
 */
export const db: Promise<StudioDatabase> = openDB<StudioSchema>(DATABASE, 1, {
  upgrade(database) {
    database.createObjectStore('projects', { keyPath: 'id' }).createIndex('openedAt', 'openedAt');
    database.createObjectStore('session', { keyPath: 'id' });
    database.createObjectStore('sessionFiles', { keyPath: 'path' });
    for (const store of ['history', 'journal'] as const) {
      database
        .createObjectStore(store, { keyPath: 'seq', autoIncrement: true })
        .createIndex('project', 'project');
    }
    database
      .createObjectStore('toolResults', { keyPath: 'path' })
      .createIndex('project', 'project');
    database.createObjectStore('preferences', { keyPath: 'key' });
  },
});
