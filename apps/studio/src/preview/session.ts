import type { DataDirectory, SessionBackend } from '@tavern-studio/backend';
import {
  canHotApply,
  hotApply,
  HOST_KEY,
  type DiagnosticEntry,
  type PageAgent,
  type PreviewHost,
  type ThemeAnatomy,
  type ViewConnection,
  type WebHostOptions,
} from '@tavern-studio/preview';
import {
  applyPlacements,
  findDifferences,
  formatPointer,
  holdsChange,
  overwrittenBy,
  type Applied,
  type DataChange,
  type Difference,
  type Placement,
} from '@tavern-studio/workspace';
import { answer, answerSync, reportFailure } from './backend-port';
import { clearBrowserState } from './browser-state';
import { EXTENSIONS, installExtension } from './extensions';
import { ownSession } from './ownership';
import { overlayEntry, overlayOf, restoreFiles, SessionPersistence } from './persistence';
import { publishChange, publishSession, readSessionState } from './publish';
import {
  loadAnatomy,
  loadFixture,
  loadVendorImages,
  loadVendorInfo,
  type VendorImage,
} from './sources';
import type { DeviceId } from './devices';
import { Views, type View, type ViewHooks } from './views';
import { registerWorker, reportWorkerDiagnostics } from './worker';

export type { ViewHooks } from './views';

/** SillyTavern and TauriTavern save settings a second after the last change. */
const SAVE_WAIT_MS = 5000;

export type OpeningStep = 'worker' | 'data';

export type SessionStatus =
  | { phase: 'opening'; step: OpeningStep }
  | { phase: 'open'; vendor: VendorImage }
  | { phase: 'failed'; error: string }
  | { phase: 'elsewhere' };

/** `agent` is the app-use engine in the page's realm. */
export interface PreviewPage {
  frame: HTMLIFrameElement;
  agent: PageAgent;
}

export interface VendorChoice {
  images: readonly VendorImage[];
  selected: string | undefined;
}

interface Opened {
  vendor: VendorImage;
  anatomy: ThemeAnatomy;
  /** The fixture with its installed extensions: the Snapshot before the project is mounted. */
  fixture: DataDirectory;
  /** The Session's data: the Snapshot and every session write since. */
  data: DataDirectory;
  backend: SessionBackend;
}

export class PreviewSession implements PreviewHost {
  #status: SessionStatus = { phase: 'opening', step: 'worker' };
  #fixture: string | undefined;
  #placements: readonly Placement[] = [];
  #overwritten: readonly Difference[] = [];
  /** Moves between placements, one at a time. */
  #placing: Promise<void> = Promise.resolve();
  #generation = 0;
  #vendors: VendorChoice = { images: [], selected: undefined };
  #device: DeviceId = 'desktop';
  #opened: Opened | undefined;
  #opening: Promise<void> | undefined;
  /** Publishing of session writes, in write order. */
  #published: Promise<void> = Promise.resolve();
  /** The Web Host's own document for a TauriTavern Session. */
  #webHostState: Record<string, unknown> | null = null;
  readonly #persistence = new SessionPersistence((error) => {
    this.#report({
      level: 'error',
      kind: 'storage',
      message: `The Session is no longer kept in IndexedDB, so reopening Studio would lose its writes: ${error instanceof Error ? error.message : String(error)}`,
      frame: 'backend',
      time: Date.now(),
    });
    this.#notify();
  });
  readonly #views = new Views((entry) => this.#report(entry));
  readonly #listeners = new Set<() => void>();
  readonly #dataListeners = new Set<(path: string) => void>();
  readonly #diagnostics: DiagnosticEntry[] = [];
  readonly #diagnosticListeners = new Set<() => void>();

  get status(): SessionStatus {
    return this.#status;
  }

  get generation(): number {
    return this.#generation;
  }

  /** The placements the Session's data reflects. */
  get placements(): readonly Placement[] {
    return this.#placements;
  }

  get overwritten(): readonly Difference[] {
    return this.#overwritten;
  }

  /** A new object whenever the images or the selection change. */
  get vendors(): VendorChoice {
    return this.#vendors;
  }

  get device(): DeviceId {
    return this.#device;
  }

  get diagnostics(): readonly DiagnosticEntry[] {
    return this.#diagnostics;
  }

  get anatomy(): ThemeAnatomy | undefined {
    return this.#opened?.anatomy;
  }

  /** The Snapshot is the fixture with the project placed, without the Session's own writes. */
  readSnapshot(path: string): Uint8Array | undefined {
    const opened = this.#opened;
    if (!opened) throw new Error('The preview Session is not open');
    const { writes } = applyPlacements(opened.fixture, opened.fixture, [], this.#placements);
    const placed = writes.get(path);
    if (placed === undefined) return opened.fixture.read(path);
    return placed ?? undefined;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  subscribeDiagnostics = (listener: () => void) => {
    this.#diagnosticListeners.add(listener);
    return () => this.#diagnosticListeners.delete(listener);
  };

  /** Opening and moving placements run one at a time, in call order. */
  open(fixture: string, placements: readonly Placement[]): Promise<void> {
    if (this.#opening && this.#fixture === fixture) return this.place(placements);
    if (this.#opening) return this.#restart(fixture, placements);
    this.#fixture = fixture;
    this.#opening = this.#queue(() => this.#open(fixture, placements)).catch((error: unknown) => {
      this.#setStatus({
        phase: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return this.#opening;
  }

  retry(): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    this.#opening = undefined;
    this.#setStatus({ phase: 'opening', step: 'worker' });
    return this.open(fixture, this.#placements);
  }

  /** Clearing the previous image's browser state needs every vendor page gone. */
  async selectVendor(id: string): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    if (this.#vendors.selected === id) return;
    this.#vendors = { ...this.#vendors, selected: id };
    await this.#restart(fixture, this.#placements);
  }

  async selectDevice(id: DeviceId): Promise<void> {
    if (this.#device === id) return;
    await this.retireViews();
    this.#device = id;
    this.#notify();
  }

  place(placements: readonly Placement[]): Promise<void> {
    return this.#queue(() => this.#move((current) => current, placements));
  }

  /**
   * Moving from the placements without this one places the project's content
   * there again, as if the Session had never held it.
   */
  discard(placement: Placement): Promise<void> {
    return this.#queue(() =>
      this.#move((current) => current.filter((placed) => placed !== placement), this.#placements),
    );
  }

  async #move(
    previousOf: (current: readonly Placement[]) => readonly Placement[],
    placements: readonly Placement[],
  ): Promise<void> {
    const opened = this.#opened;
    const previous = previousOf(this.#placements);
    if (!opened) {
      // A Session that failed to open retries with the latest placements.
      this.#placements = placements;
      return;
    }
    this.#reportOverwritten(overwrittenBy(opened.data, previous, placements));
    const applied = applyPlacements(opened.fixture, opened.data, previous, placements);
    if (applied.writes.size === 0) {
      this.#setPlacements(placements);
      return;
    }
    const views = this.#views.all();
    const pages = views.flatMap((view) =>
      view.agent && view.frame.contentWindow ? [view.frame.contentWindow] : [],
    );
    // With no page running there is no one to take a value, so the data is written below.
    const running = pages.length > 0 && pages.length === views.length;
    if (running && canHotApply(pages, opened.anatomy, applied.changes)) {
      // A running page is the only writer of its data: its own controls take
      // the values, and it saves them itself, through its own checks. A whole
      // file has no writer in the page, so Studio writes it, and the data then
      // reflects the new placements there; the pages load it once the Preview
      // SW serves it.
      const files = new Set(
        applied.changes.filter((change) => change.pointer === undefined).map(({ path }) => path),
      );
      if (files.size > 0) {
        this.#write(opened.data, new Map([...applied.writes].filter(([path]) => files.has(path))));
        this.#setPlacements([
          ...previous.filter((placement) => !files.has(placement.path)),
          ...placements.filter((placement) => files.has(placement.path)),
        ]);
        await this.#published;
      }
      const results = await Promise.all(
        pages.map((page) => hotApply(page, opened.anatomy, applied.changes)),
      );
      const missed = results.flatMap((result) => result.missed);
      // The vendor saves the value as it holds it, a colour in its own form for instance.
      const held = results.flatMap((result) => result.held);
      const unsaved = missed.length > 0 ? [] : await this.#savedBy(opened.data, held);
      if (missed.length === 0 && unsaved.length === 0) {
        this.#setPlacements(placements);
        return;
      }
      const positions = (missed.length > 0 ? missed : unsaved).map((change) =>
        change.pointer ? `${change.path}#${formatPointer(change.pointer)}` : change.path,
      );
      this.#report({
        level: 'warning',
        kind: 'hot-apply',
        message: `The vendor did not ${missed.length > 0 ? 'take' : 'save'} ${[...new Set(positions)].join(', ')}; the preview reloads instead`,
        frame: 'page',
        time: Date.now(),
      });
    }
    // The pages save on exit before Studio writes, so no write meets a page that read older data.
    await this.retireViews();
    this.#write(
      opened.data,
      applyPlacements(opened.fixture, opened.data, previous, placements).writes,
    );
    this.#setPlacements(placements);
    this.#bumpGeneration();
  }

  #savedBy(data: DataDirectory, changes: readonly DataChange[]): Promise<DataChange[]> {
    const missing = () => changes.filter((change) => !holdsChange(data, change));
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        stop();
        resolve(missing());
      };
      const stop = this.subscribeData(() => {
        if (missing().length === 0) finish();
      });
      const timer = setTimeout(finish, SAVE_WAIT_MS);
      if (missing().length === 0) finish();
    });
  }

  async reload(): Promise<void> {
    await this.retireViews();
    this.#bumpGeneration();
  }

  async reset(): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    await this.retireViews();
    this.#opened = undefined;
    await this.#persistence.clear();
    await this.#restart(fixture, this.#placements);
  }

  get persistenceError(): string | undefined {
    return this.#persistence.error;
  }

  /** Call it before opening. */
  own(): Promise<void> {
    return ownSession({
      handOver: () =>
        this.#queue(async () => {
          await this.retireViews();
          this.#opened = undefined;
          await this.#persistence.flush();
        }),
      lost: () => {
        this.#opened = undefined;
        this.#setStatus({ phase: 'elsewhere' });
      },
      report: this.#report,
    });
  }

  /** Session writes included. */
  readData(path: string): Uint8Array | undefined {
    return this.#opened?.data.read(path);
  }

  /** The listener stays across Sessions. */
  subscribeData = (listener: (path: string) => void) => {
    this.#dataListeners.add(listener);
    return () => this.#dataListeners.delete(listener);
  };

  async #restart(fixture: string, placements: readonly Placement[]): Promise<void> {
    await this.retireViews();
    if (this.#opened) {
      this.#reportOverwritten(findDifferences(this.#opened.data, this.#placements));
    }
    this.#opened = undefined;
    this.#opening = undefined;
    this.#setStatus({ phase: 'opening', step: 'worker' });
    await this.#views.closed();
    await this.open(fixture, placements);
  }

  #queue(task: () => Promise<void>): Promise<void> {
    const run = this.#placing.then(task);
    this.#placing = run.catch(() => undefined);
    return run;
  }

  #setPlacements(placements: readonly Placement[]): void {
    this.#placements = placements;
    this.#persistence.placements(placements);
    this.#notify();
  }

  #reportOverwritten(differences: readonly Difference[]): void {
    if (differences.length === 0) return;
    this.#overwritten = differences;
    this.#notify();
  }

  #write(data: DataDirectory, writes: Applied['writes']): void {
    for (const [path, content] of writes) {
      if (content === null) data.delete(path);
      else data.write(path, content);
    }
  }

  #bumpGeneration(): void {
    this.#generation += 1;
    this.#notify();
  }

  /** Call it before the frame navigates, so its vendor page can connect. */
  addView(frame: HTMLIFrameElement, hooks: ViewHooks): () => void {
    return this.#views.add(frame, hooks);
  }

  /**
   * Unloads every View's vendor page while its frame is still in the
   * document. Call it before anything removes a View.
   */
  retireViews(): Promise<void> {
    return this.#views.retire();
  }

  /**
   * Writes the way a vendor's save lands; the experiment scripts stage their
   * scenes with it. Project changes go through `place`. Resolves once the
   * Preview SW serves the new content.
   */
  updateData(path: string, content: Uint8Array | string): Promise<void> {
    if (!this.#opened) throw new Error('The preview Session is not open');
    this.#opened.data.write(path, content);
    return this.#published;
  }

  page(): PreviewPage | undefined {
    const view = this.#views.all().findLast((candidate) => candidate.agent !== undefined);
    return view?.agent && { frame: view.frame, agent: view.agent };
  }

  whenPage(signal?: AbortSignal): Promise<PreviewPage> {
    return new Promise((resolve, reject) => {
      const settle = () => {
        const page = this.page();
        const status = this.#status;
        if (page) resolve(page);
        else if (signal?.aborted) reject(signal.reason);
        else if (status.phase === 'failed')
          reject(new Error(`The preview failed to open: ${status.error}`));
        else if (status.phase === 'elsewhere')
          reject(new Error('Another Studio tab holds the preview now'));
        else return;
        unsubscribe();
        signal?.removeEventListener('abort', settle);
      };
      const unsubscribe = this.subscribe(settle);
      signal?.addEventListener('abort', settle);
      settle();
    });
  }

  connect(page: Window, agent: PageAgent): ViewConnection {
    const { view, opened } = this.#viewOf(page);
    return {
      vendorId: opened.vendor.id,
      vendorKind: opened.vendor.kind,
      device: view.device,
      handle: (request) => answer(opened.backend, request, this.#report),
      readData: (path) => opened.data.read(path),
      report: this.#report,
      ready: () => {
        view.agent = agent;
        view.onReady();
        this.#notify();
      },
    };
  }

  /**
   * Values cross realms as clones made in the receiving realm: the page may
   * navigate away while Studio still holds what it saved, and the page's own
   * checks expect its own objects.
   */
  webHost(page: Window): WebHostOptions {
    const { view, opened } = this.#viewOf(page);
    if (opened.vendor.kind !== 'tt') {
      throw new Error(`${opened.vendor.label} does not run on TauriTavern's Web Host`);
    }
    return {
      identity: view.device.host,
      backend: { handle: (request) => answerSync(opened.backend, request, this.#report) },
      store: {
        load: () => this.#webHostState && page.structuredClone(this.#webHostState),
        save: (value) => {
          this.#webHostState = structuredClone(value);
          this.#persistence.webHost(this.#webHostState);
        },
      },
    };
  }

  exitThrough(page: Window, exit: () => Promise<void>): void {
    this.#viewOf(page).view.exit = exit;
  }

  #viewOf(page: Window): { view: View; opened: Opened } {
    const view = this.#views.get(page.frameElement);
    const opened = this.#opened;
    if (!view || !opened) throw new Error('A vendor page loaded outside a registered preview View');
    return { view, opened };
  }

  async #open(fixture: string, placements: readonly Placement[]): Promise<void> {
    this.#placements = placements;
    const started = performance.now();
    const worker = await registerWorker();
    reportWorkerDiagnostics(this.#report);
    const workerReady = performance.now();

    this.#setStatus({ phase: 'opening', step: 'data' });
    const [images, stored] = await Promise.all([loadVendorImages(), this.#persistence.load()]);
    // Until the user picks one, Studio resumes the persisted Session's image.
    const { selected } = this.#vendors;
    const vendor =
      selected === undefined
        ? (images.find((image) => image.id === stored?.record.vendor) ?? images[0])
        : images.find((image) => image.id === selected);
    if (!vendor) {
      throw new Error(
        selected === undefined
          ? 'No vendor image is built (run `pnpm vendor:st 1.19.0`)'
          : `Vendor image ${selected} is not built`,
      );
    }
    const resumed =
      stored?.record.fixture === fixture && stored.record.vendor === vendor.id ? stored : undefined;
    this.#vendors = { images, selected: vendor.id };
    const [info, anatomy, files, extensions, published, backend] = await Promise.all([
      loadVendorInfo(vendor.id),
      loadAnatomy(vendor.id),
      loadFixture(fixture),
      Promise.all(EXTENSIONS.map(installExtension)).then((installed) => installed.flat()),
      readSessionState(),
      // The Session Backend is the preview's runtime, not the shell's first screen.
      import('@tavern-studio/backend'),
    ]);
    // Browser-side state follows the vendor image that wrote it.
    if (published && published.vendor !== vendor.id) await clearBrowserState();
    const base: [string, Uint8Array][] = [
      ...files.files,
      ...extensions.map((file): [string, Uint8Array] => [file.path, file.bytes]),
    ];
    const hashes = new Map([
      ...files.hashes,
      ...extensions.map((file): [string, string] => [file.path, file.sha256]),
    ]);
    // The data is the Snapshot, the fixture with the project mounted, or the
    // persisted Session moved from the placements it reflects to the current ones.
    const fixtureData = new backend.DataDirectory(base);
    const data = new backend.DataDirectory(base);
    restoreFiles(data, resumed?.files ?? []);
    const reflected = resumed?.record.placements ?? [];
    this.#reportOverwritten(overwrittenBy(data, reflected, placements));
    this.#write(data, applyPlacements(fixtureData, data, reflected, placements).writes);
    const overlay = overlayOf(fixtureData, data);
    for (const { path } of overlay) hashes.delete(path);
    this.#webHostState = resumed?.record.webHost ?? null;
    void this.#persistence.begin(
      { id: 'session', fixture, vendor: vendor.id, placements, webHost: this.#webHostState },
      overlay,
    );
    await publishSession(data, hashes, { vendor: vendor.id }, worker);
    data.onChange((path) => {
      this.#published = this.#published
        .then(() => publishChange(data, path))
        .catch((error: unknown) => reportFailure(this.#report, `Publishing ${path}`, error));
      this.#persistence.file(path, overlayEntry(fixtureData, data, path));
      for (const listener of this.#dataListeners) listener(path);
    });

    this.#opened = {
      vendor,
      anatomy,
      fixture: fixtureData,
      data,
      backend: backend.createSessionBackend(data, info),
    };
    (window as Window & { [HOST_KEY]?: PreviewHost })[HOST_KEY] = this;
    performance.measure('studio:session-worker', { start: started, end: workerReady });
    performance.measure('studio:session-data', { start: workerReady });
    this.#setStatus({ phase: 'open', vendor });
  }

  #report = (entry: DiagnosticEntry): void => {
    this.#diagnostics.push(entry);
    for (const listener of this.#diagnosticListeners) listener();
  };

  #setStatus(status: SessionStatus): void {
    this.#status = status;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const previewSession = new PreviewSession();
