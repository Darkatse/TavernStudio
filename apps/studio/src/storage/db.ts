import type { CheckpointFile, HistoryEntry, JournalEvent } from '@tavern-studio/agent';
import type { Placement } from '@tavern-studio/workspace';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DATABASE = 'tavern-studio';

export interface ProjectRecord {
  id: string;
  name: string;
  /** Where the project's first files came from: a template's name, or `archive` for an imported project. */
  origin: string;
  createdAt: number;
  openedAt: number;
}

/**
 * Keeps the placements the Session's data reflects, so that reopening can move
 * from those to the project's current ones.
 */
export interface SessionRecord {
  id: 'session';
  fixture: string;
  vendor: string;
  placements: readonly Placement[];
  /** The Web Host's own document. */
  webHost: Record<string, unknown> | null;
}

/** A data file where the Session differs from the fixture: its content, or null when deleted. */
export interface SessionFile {
  path: string;
  content: Uint8Array | null;
}

export interface HistoryRecord extends HistoryEntry {
  seq?: number;
  project: string;
}

export interface JournalRecord {
  seq?: number;
  project: string;
  event: JournalEvent;
}

export interface ToolResultRecord {
  /** Its path inside `tool-results/`: `<run>/round-NNN-call_<hash>.txt`. */
  path: string;
  project: string;
  text: string;
}

export interface CheckpointFileRecord extends CheckpointFile {
  project: string;
  /** The compressed size of the content kept for `before`, which the limit counts. */
  size: number;
}

/** A file content a Checkpoint keeps, gzip-compressed, by its SHA-256; shared across projects. */
export interface CheckpointBlobRecord {
  sha256: string;
  gzip: Uint8Array;
}

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
  checkpointFiles: {
    key: [string, string];
    value: CheckpointFileRecord;
    indexes: { project: string };
  };
  checkpointBlobs: { key: string; value: CheckpointBlobRecord };
  preferences: { key: string; value: PreferenceRecord };
}

export type StudioDatabase = IDBPDatabase<StudioSchema>;

export const db: Promise<StudioDatabase> = openDB<StudioSchema>(DATABASE, 2, {
  upgrade(database, oldVersion) {
    if (oldVersion < 1) {
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
    }
    if (oldVersion < 2) {
      database
        .createObjectStore('checkpointFiles', { keyPath: ['op', 'path'] })
        .createIndex('project', 'project');
      database.createObjectStore('checkpointBlobs', { keyPath: 'sha256' });
    }
  },
});
