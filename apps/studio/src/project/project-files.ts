import type { ProjectStore } from '@tavern-studio/workspace';
import { useSyncExternalStore } from 'react';

export interface ProjectFiles {
  /** Every file of the project, in name order; undefined until first listed. */
  files: readonly string[] | undefined;
  /** Why the files could not be listed, as the store said. */
  error: string | undefined;
}

/**
 * A project's file list, listed again after every change made through its
 * store, the Agent's writes included. Listings run one at a time, and a
 * burst of changes leads to one more listing.
 */
class FileListing {
  #state: ProjectFiles = { files: undefined, error: undefined };
  #listing = false;
  #stale = false;
  readonly #store: ProjectStore;
  readonly #listeners = new Set<() => void>();

  constructor(store: ProjectStore) {
    this.#store = store;
    store.subscribe(() => this.list());
    this.list();
  }

  get state(): ProjectFiles {
    return this.#state;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  list(): void {
    if (this.#listing) {
      this.#stale = true;
      return;
    }
    this.#listing = true;
    void this.#store
      .files('')
      .then(
        (files) => ({ files, error: undefined }),
        (error: unknown) => ({
          files: this.#state.files,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      .then((state) => {
        this.#state = state;
        for (const listener of this.#listeners) listener();
        this.#listing = false;
        if (!this.#stale) return;
        this.#stale = false;
        this.list();
      });
  }
}

const listings = new WeakMap<ProjectStore, FileListing>();

function listingOf(store: ProjectStore): FileListing {
  let listing = listings.get(store);
  if (!listing) {
    listing = new FileListing(store);
    listings.set(store, listing);
  }
  return listing;
}

/** Lists the files again, for example after a listing failed. */
export function relist(store: ProjectStore): void {
  listingOf(store).list();
}

export function useProjectFiles(store: ProjectStore): ProjectFiles {
  const listing = listingOf(store);
  return useSyncExternalStore(listing.subscribe, () => listing.state);
}
