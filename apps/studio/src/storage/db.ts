import type { Placement } from '@tavern-studio/workspace';
import { Dexie, type EntityTable } from 'dexie';

/** Studio's one IndexedDB database (docs/Architecture.md §7). */
export const DATABASE = 'studio';

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

export const db = new Dexie(DATABASE) as Dexie & {
  projects: EntityTable<ProjectRecord, 'id'>;
  session: EntityTable<SessionRecord, 'id'>;
  sessionFiles: EntityTable<SessionFile, 'path'>;
};

db.version(1).stores({ projects: 'id, openedAt' });
db.version(2).stores({ session: 'id', sessionFiles: 'path' });
