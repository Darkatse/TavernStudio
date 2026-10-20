import {
  adopt,
  findDifferences,
  MANIFEST,
  parseManifest,
  resolveMounts,
  type Difference,
  type Placement,
  type ProjectStore,
} from '@tavern-studio/workspace';
import { previewSession } from '../preview/session';
import type { ProjectRecord } from '../storage/db';

export interface ProjectState {
  error: string | undefined;
  differences: readonly Difference[];
}

const decoder = new TextDecoder();

export class Project {
  /** A rename replaces it; the id stays. */
  record: ProjectRecord;
  readonly store: ProjectStore;
  #state: ProjectState = { error: undefined, differences: [] };
  #resolving: Promise<void> | undefined;
  #stale = false;
  #comparing = false;
  readonly #listeners = new Set<() => void>();
  readonly #stops: (() => void)[] = [];

  constructor(record: ProjectRecord, store: ProjectStore) {
    this.record = record;
    this.store = store;
  }

  get state(): ProjectState {
    return this.#state;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  start(): Promise<void> {
    this.#stops.push(
      this.store.subscribe(() => this.#schedule()),
      previewSession.subscribeData(() => this.#compareSoon()),
      previewSession.subscribe(() => this.#compareSoon()),
    );
    this.#schedule();
    return this.#resolving ?? Promise.resolve();
  }

  close(): void {
    for (const stop of this.#stops.splice(0)) stop();
    this.#listeners.clear();
  }

  /**
   * A write schedules its placing before it resolves, so whatever waits here
   * after writing sees the preview move on, reload included.
   */
  async placed(): Promise<void> {
    while (this.#resolving) await this.#resolving;
  }

  async adopt(placement: Placement): Promise<void> {
    const differences = this.#state.differences.filter((d) => d.placement === placement);
    if (differences.length === 0) return;
    const source = await this.store.read(placement.source).catch(() => new Uint8Array());
    const content = adopt(differences, source);
    if (content === null) await this.store.remove(placement.source);
    else await this.store.write(placement.source, content);
  }

  discard(placement: Placement): Promise<void> {
    return previewSession.discard(placement);
  }

  /** Changes arrive in bursts: one resolve runs at a time and then picks up the latest files. */
  #schedule(): void {
    if (this.#resolving) {
      this.#stale = true;
      return;
    }
    this.#resolving = this.#resolve().finally(() => {
      this.#resolving = undefined;
      if (!this.#stale) return;
      this.#stale = false;
      this.#schedule();
    });
  }

  async #resolve(): Promise<void> {
    try {
      const manifest = parseManifest(decoder.decode(await this.store.read(MANIFEST)));
      const placements = await resolveMounts(manifest, this.store);
      await previewSession.open(manifest.fixture, placements);
      this.#setState({ error: undefined });
    } catch (error) {
      this.#setState({ error: error instanceof Error ? error.message : String(error) });
    }
    this.#compare();
  }

  /** The vendor saves in bursts too, so comparing waits for the current task to end. */
  #compareSoon(): void {
    if (this.#comparing) return;
    this.#comparing = true;
    queueMicrotask(() => {
      this.#comparing = false;
      this.#compare();
    });
  }

  /** Compares with the placements the Session has applied, which its data reflects. */
  #compare(): void {
    const differences =
      previewSession.status.phase === 'open'
        ? findDifferences(
            { read: (path) => previewSession.readData(path) },
            previewSession.placements,
          )
        : [];
    if (differences.length === 0 && this.#state.differences.length === 0) return;
    this.#setState({ differences });
  }

  #setState(change: Partial<ProjectState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }
}
