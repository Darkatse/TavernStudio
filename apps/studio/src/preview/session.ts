import { createSessionBackend, DataDirectory, type SessionBackend } from '@tavern-studio/backend';
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
  formatPointer,
  holdsChange,
  type Applied,
  type DataChange,
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
import { registerWorker, reportUnansweredRequests } from './worker';

export type { ViewHooks } from './views';

/**
 * How long a page may take to save hot-applied values. SillyTavern and
 * TauriTavern save settings a second after the last change.
 */
const SAVE_WAIT_MS = 5000;

export type OpeningStep = 'worker' | 'data';

export type SessionStatus =
  | { phase: 'opening'; step: OpeningStep }
  | { phase: 'open'; vendor: VendorImage }
  | { phase: 'failed'; error: string }
  /** Another Studio tab holds the Session now (docs/Architecture.md §4). */
  | { phase: 'elsewhere' };

/** A View's vendor page that has started, with the app-use engine in its realm. */
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

/**
 * The one preview Session of this browser (docs/Architecture.md §2): the
 * Session Backend over the Snapshot, the fixture with the project's
 * placements, published for the Preview SW, and the host every View's vendor
 * page connects to.
 */
export class PreviewSession implements PreviewHost {
  #status: SessionStatus = { phase: 'opening', step: 'worker' };
  #fixture: string | undefined;
  #placements: readonly Placement[] = [];
  /** Moves between placements, one at a time. */
  #placing: Promise<void> = Promise.resolve();
  /** Each reload creates new Views: reloading is the authoritative path. */
  #generation = 0;
  /** `selected` is the image the next Session opens: the first built one until the user picks. */
  #vendors: VendorChoice = { images: [], selected: undefined };
  /** The device the Views present (docs/Architecture.md §2). */
  #device: DeviceId = 'desktop';
  #opened: Opened | undefined;
  #opening: Promise<void> | undefined;
  /** Publishing of session writes, in write order. */
  #published: Promise<void> = Promise.resolve();
  /** The Web Host's own document for a TauriTavern Session (docs/Vendors.md §3). */
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

  /** Views of an older generation have been reloaded away. */
  get generation(): number {
    return this.#generation;
  }

  /** The placements the Session's data reflects. */
  get placements(): readonly Placement[] {
    return this.#placements;
  }

  /** The built images and the one selected; a new object whenever either changes. */
  get vendors(): VendorChoice {
    return this.#vendors;
  }

  get device(): DeviceId {
    return this.#device;
  }

  get diagnostics(): readonly DiagnosticEntry[] {
    return this.#diagnostics;
  }

  /** The anatomy of the frontend the Session runs; undefined until it is open. */
  get anatomy(): ThemeAnatomy | undefined {
    return this.#opened?.anatomy;
  }

  /**
   * A data file of the Snapshot (docs/Architecture.md §2): the fixture with
   * the project placed, without the Session's own writes. Exports assemble
   * from it. Undefined where the Snapshot has no such file.
   */
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

  /**
   * Opens the Session on a fixture with a project's placements. The same
   * fixture again only moves the placements; another fixture is a new Session.
   * Opening and moving placements run one at a time, in call order.
   */
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

  /** Retries after a failure. */
  retry(): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    this.#opening = undefined;
    this.#setStatus({ phase: 'opening', step: 'worker' });
    return this.open(fixture, this.#placements);
  }

  /**
   * Switches to another vendor image: a new Session on the same Snapshot.
   * Clearing the previous image's browser state needs every vendor page gone
   * (docs/Architecture.md §7).
   */
  async selectVendor(id: string): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    if (this.#vendors.selected === id) return;
    this.#vendors = { ...this.#vendors, selected: id };
    await this.#restart(fixture, this.#placements);
  }

  /** Presents another device: the Views unload and come back as that device. */
  async selectDevice(id: DeviceId): Promise<void> {
    if (this.#device === id) return;
    await this.retireViews();
    this.#device = id;
    this.#notify();
  }

  /**
   * Moves the Session to new placements (docs/Architecture.md §5). A running
   * page is the only writer of its data: when every View is running and every
   * change has a hot-apply entry, the pages' own controls take the values and
   * the pages save them, and the placements count as moved once the data
   * shows it. Files no page writes, an extension's stylesheet for one, Studio
   * writes itself before the pages load them again. Otherwise the Views
   * unload first, saving on exit, and Studio writes the data before they load
   * again.
   */
  place(placements: readonly Placement[]): Promise<void> {
    return this.#queue(() => this.#move((current) => current, placements));
  }

  /**
   * Discards the session writes on one mount point: the project's content is
   * placed there again, as if the Session had never held it.
   */
  discard(placement: Placement): Promise<void> {
    return this.#queue(() =>
      this.#move((current) => current.filter((placed) => placed !== placement), this.#placements),
    );
  }

  /** Moves the data from the placements `previousOf` makes of the current ones to `placements`. */
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

  /**
   * Waits for a page's own save to bring the data to hot-applied values, and
   * returns the changes it had not saved in time.
   */
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

  /** Reloads every View: the authoritative way to show the Session's data. */
  async reload(): Promise<void> {
    await this.retireViews();
    this.#bumpGeneration();
  }

  /**
   * Discards every session write: the persisted Session goes, and a new one
   * opens on the Snapshot (docs/Architecture.md §7).
   */
  async reset(): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    await this.retireViews();
    this.#opened = undefined;
    await this.#persistence.clear();
    await this.#restart(fixture, this.#placements);
  }

  /** False once a session write could not be kept in IndexedDB. */
  get persisted(): boolean {
    return !this.#persistence.failed;
  }

  /**
   * Makes this tab the one that holds the Session, taking it from another
   * Studio tab if one does (docs/Architecture.md §4). Call it before opening.
   */
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

  /** Reads the Session's data, session writes included. */
  readData(path: string): Uint8Array | undefined {
    return this.#opened?.data.read(path);
  }

  /** Listens for every change to the Session's data, across Sessions. */
  subscribeData = (listener: (path: string) => void) => {
    this.#dataListeners.add(listener);
    return () => this.#dataListeners.delete(listener);
  };

  /** Closes the current Session and opens a new one. */
  async #restart(fixture: string, placements: readonly Placement[]): Promise<void> {
    await this.retireViews();
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

  /**
   * Registers a View's frame before it navigates, so its vendor page can
   * connect. Returns the function that unregisters it.
   */
  addView(frame: HTMLIFrameElement, hooks: ViewHooks): () => void {
    return this.#views.add(frame, hooks);
  }

  /**
   * Unloads every View's vendor page while its frame is still in the
   * document (docs/Architecture.md §4). Call it before anything removes a View.
   */
  retireViews(): Promise<void> {
    return this.#views.retire();
  }

  /**
   * Writes a file of the Session's data directly, the way a vendor's save
   * lands; the experiment scripts stage their scenes with it. Project changes
   * go through `place`. Resolves once the Preview SW serves the new content.
   */
  updateData(path: string, content: Uint8Array | string): Promise<void> {
    if (!this.#opened) throw new Error('The preview Session is not open');
    this.#opened.data.write(path, content);
    return this.#published;
  }

  /**
   * The vendor page the author is looking at: the newest View that is ready,
   * with its app-use engine, for the Agent's `app.*` tools and screenshots.
   * Undefined while the preview starts or reloads.
   */
  page(): PreviewPage | undefined {
    const view = this.#views.all().findLast((candidate) => candidate.agent !== undefined);
    return view?.agent && { frame: view.frame, agent: view.agent };
  }

  /**
   * The page once a View is ready, for whatever waits on a reload or a
   * switch. Rejects when the Session cannot open here, or on `signal`.
   */
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
    reportUnansweredRequests(this.#report);
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
    const [info, anatomy, files, extensions, published] = await Promise.all([
      loadVendorInfo(vendor.id),
      loadAnatomy(vendor.id),
      loadFixture(fixture),
      Promise.all(EXTENSIONS.map(installExtension)).then((installed) => installed.flat()),
      readSessionState(),
    ]);
    // Browser-side state follows the vendor image that wrote it (docs/Architecture.md §7).
    if (published && published.vendor !== vendor.id) await clearBrowserState();
    const base: [string, Uint8Array][] = [
      ...files.files,
      ...extensions.map((file): [string, Uint8Array] => [file.path, file.bytes]),
    ];
    const hashes = new Map([
      ...files.hashes,
      ...extensions.map((file): [string, string] => [file.path, file.sha256]),
    ]);
    // The data is the Snapshot, the fixture with the project mounted (docs/Architecture.md §2),
    // or the persisted Session moved from the placements it reflects to the current ones (§7).
    const fixtureData = new DataDirectory(base);
    const data = new DataDirectory(base);
    restoreFiles(data, resumed?.files ?? []);
    const reflected = resumed?.record.placements ?? [];
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
      backend: createSessionBackend(data, info),
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
