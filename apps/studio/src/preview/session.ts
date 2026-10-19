import { createSessionBackend, DataDirectory, type SessionBackend } from '@tavern-studio/backend';
import {
  canHotApply,
  hotApply,
  HOST_KEY,
  type DeviceIdentity,
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
  type Applied,
  type Placement,
} from '@tavern-studio/workspace';
import { answer, answerSync, reportFailure } from './backend-port';
import { clearBrowserState } from './browser-state';
import { EXTENSIONS, installExtension } from './extensions';
import { publishChange, publishSession, readSessionState } from './publish';
import {
  loadAnatomy,
  loadFixture,
  loadVendorImages,
  loadVendorInfo,
  type VendorImage,
} from './sources';
import { registerWorker, reportUnansweredRequests } from './worker';

export type OpeningStep = 'worker' | 'data';

export type SessionStatus =
  | { phase: 'opening'; step: OpeningStep }
  | { phase: 'open'; vendor: VendorImage }
  | { phase: 'failed'; error: string };

export interface VendorChoice {
  images: readonly VendorImage[];
  selected: string | undefined;
}

/** What a View's frame tells the Session, and how the Session tells it back. */
export interface ViewHooks {
  device: DeviceIdentity;
  /** The vendor page emitted APP_READY. */
  onReady(): void;
  /** The vendor page is being unloaded, ahead of the View being removed. */
  onRetire(): void;
}

interface View extends ViewHooks {
  frame: HTMLIFrameElement;
  /** Set once the vendor page has connected and emitted APP_READY. */
  agent?: PageAgent;
  /** The page's own way to save and close, when it has one (TauriTavern). */
  exit?: () => Promise<void>;
}

/** How long a page may take to save on exit before its View is removed anyway. */
const EXIT_TIMEOUT_MS = 5000;

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
  #opened: Opened | undefined;
  #opening: Promise<void> | undefined;
  /** Publishing of session writes, in write order. */
  #published: Promise<void> = Promise.resolve();
  /** The Web Host's own document for a TauriTavern Session (docs/Vendors.md §3). */
  #webHostState: Record<string, unknown> | null = null;
  /** Keyed by frame, which is how a connecting page finds its View. */
  readonly #views = new Map<Element, View>();
  readonly #viewsClosed = new Set<() => void>();
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

  get diagnostics(): readonly DiagnosticEntry[] {
    return this.#diagnostics;
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

  /**
   * Moves the Session to new placements (docs/Architecture.md §5). When every
   * View is running and every change has a hot-apply entry, the data and the
   * vendor pages change in one task, so no stale save of a vendor can come in
   * between. Otherwise the Views unload first, letting TauriTavern save on
   * exit, and the data changes before they load again.
   */
  place(placements: readonly Placement[]): Promise<void> {
    return this.#queue(async () => {
      const opened = this.#opened;
      const previous = this.#placements;
      if (!opened) {
        // A Session that failed to open retries with the latest placements.
        this.#placements = placements;
        return;
      }
      const applied = applyPlacements(opened.fixture, opened.data, previous, placements);
      const pages = [...this.#views.values()].map((view) => view.agent && view.frame.contentWindow);
      if (applied.writes.size === 0) {
        this.#placements = placements;
      } else if (pages.every(Boolean) && canHotApply(opened.anatomy, applied.changes)) {
        this.#write(opened.data, applied);
        this.#placements = placements;
        const missed = pages.flatMap((page) =>
          page ? hotApply(page, opened.anatomy, applied.changes) : [],
        );
        if (missed.length === 0) return;
        const positions = missed.map(
          (change) => `${change.path}#${formatPointer(change.pointer ?? [])}`,
        );
        this.#report({
          level: 'warning',
          kind: 'hot-apply',
          message: `The vendor did not take ${[...new Set(positions)].join(', ')} through its controls; the preview reloaded instead`,
          frame: 'page',
          time: Date.now(),
        });
        await this.reload();
      } else {
        await this.retireViews();
        this.#write(
          opened.data,
          applyPlacements(opened.fixture, opened.data, previous, placements),
        );
        this.#placements = placements;
        this.#bumpGeneration();
      }
    });
  }

  /** Reloads every View: the authoritative way to show the Session's data. */
  async reload(): Promise<void> {
    await this.retireViews();
    this.#bumpGeneration();
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
    await this.#closedViews();
    await this.open(fixture, placements);
  }

  #queue(task: () => Promise<void>): Promise<void> {
    const run = this.#placing.then(task);
    this.#placing = run.catch(() => undefined);
    return run;
  }

  #write(data: DataDirectory, { writes }: Applied): void {
    for (const [path, content] of writes) {
      if (content === null) data.delete(path);
      else data.write(path, content);
    }
  }

  #bumpGeneration(): void {
    this.#generation += 1;
    for (const listener of this.#listeners) listener();
  }

  /**
   * Registers a View's frame before it navigates, so its vendor page can
   * connect. Returns the function that unregisters it.
   */
  addView(frame: HTMLIFrameElement, hooks: ViewHooks): () => void {
    const created = performance.now();
    this.#views.set(frame, {
      ...hooks,
      frame,
      onReady: () => {
        performance.measure('studio:view-ready', { start: created });
        hooks.onReady();
      },
    });
    return () => {
      this.#views.delete(frame);
      if (this.#views.size > 0) return;
      for (const resolve of this.#viewsClosed) resolve();
      this.#viewsClosed.clear();
    };
  }

  /**
   * Unloads every View's vendor page while its frame is still in the
   * document, as a reload of the real page would. Call it before anything
   * removes a View: vendors save on pagehide (TauriTavern flushes its
   * settings and chat then), and a frame that is already removed has a
   * detached realm in which those saves fail.
   */
  async retireViews(): Promise<void> {
    await Promise.all(
      [...this.#views.values()].map(async (view) => {
        view.onRetire();
        await this.#exit(view);
        await new Promise<void>((resolve) => {
          view.frame.addEventListener('load', () => resolve(), { once: true });
          view.frame.src = 'about:blank';
        });
      }),
    );
  }

  /**
   * Lets a page that can say when it has saved (TauriTavern) close through
   * its own path first. A save that fails keeps such a page open; the View
   * is removed anyway, since the user asked for it, and the loss is reported.
   */
  async #exit(view: View): Promise<void> {
    if (!view.exit) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<true>((resolve) => {
      timer = setTimeout(() => resolve(true), EXIT_TIMEOUT_MS);
    });
    const late = await Promise.race([view.exit().then(() => false), timedOut]);
    clearTimeout(timer);
    if (!late) return;
    this.#report({
      level: 'error',
      kind: 'error',
      message: `The vendor page did not finish saving within ${EXIT_TIMEOUT_MS / 1000} s; changes since its last save may be lost`,
      frame: 'page',
      time: Date.now(),
    });
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

  /** The app-use engine of a View's vendor page, for the Agent's `app.*` tools. */
  pageAgent(frame: HTMLIFrameElement): PageAgent {
    const agent = this.#views.get(frame)?.agent;
    if (!agent)
      throw new Error('The vendor page is still starting. Wait until the preview is ready.');
    return agent;
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
        },
      },
    };
  }

  exitThrough(page: Window, exit: () => Promise<void>): void {
    this.#viewOf(page).view.exit = exit;
  }

  #viewOf(page: Window): { view: View; opened: Opened } {
    const view = page.frameElement && this.#views.get(page.frameElement);
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
    const images = await loadVendorImages();
    const { selected } = this.#vendors;
    const vendor =
      selected === undefined ? images[0] : images.find((image) => image.id === selected);
    if (!vendor) {
      throw new Error(
        selected === undefined
          ? 'No vendor image is built (run `pnpm vendor:st 1.19.0`)'
          : `Vendor image ${selected} is not built`,
      );
    }
    this.#vendors = { images, selected: vendor.id };
    const [info, anatomy, files, extensions, previous] = await Promise.all([
      loadVendorInfo(vendor.id),
      loadAnatomy(vendor.id),
      loadFixture(fixture),
      Promise.all(EXTENSIONS.map(installExtension)).then((installed) => installed.flat()),
      readSessionState(),
    ]);
    // Browser-side state follows the vendor image that wrote it (docs/Architecture.md §7).
    if (previous && previous.vendor !== vendor.id) await clearBrowserState();
    const base: [string, Uint8Array][] = [
      ...files.files,
      ...extensions.map((file): [string, Uint8Array] => [file.path, file.bytes]),
    ];
    const hashes = new Map([
      ...files.hashes,
      ...extensions.map((file): [string, string] => [file.path, file.sha256]),
    ]);
    // The data starts as the Snapshot: the fixture with the project mounted (docs/Architecture.md §2).
    const fixtureData = new DataDirectory(base);
    const data = new DataDirectory(base);
    const { writes } = applyPlacements(fixtureData, fixtureData, [], placements);
    for (const path of writes.keys()) hashes.delete(path);
    this.#write(data, { writes, changes: [] });
    await publishSession(data, hashes, { vendor: vendor.id }, worker);
    data.onChange((path) => {
      this.#published = this.#published
        .then(() => publishChange(data, path))
        .catch((error: unknown) => reportFailure(this.#report, `Publishing ${path}`, error));
      for (const listener of this.#dataListeners) listener(path);
    });

    this.#webHostState = null;
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

  #closedViews(): Promise<void> {
    if (this.#views.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.#viewsClosed.add(resolve));
  }

  #report = (entry: DiagnosticEntry): void => {
    this.#diagnostics.push(entry);
    for (const listener of this.#diagnosticListeners) listener();
  };

  #setStatus(status: SessionStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}

export const previewSession = new PreviewSession();
