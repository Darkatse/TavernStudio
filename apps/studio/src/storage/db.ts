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

export const db = new Dexie(DATABASE) as Dexie & {
  projects: EntityTable<ProjectRecord, 'id'>;
};

db.version(1).stores({ projects: 'id, openedAt' });
