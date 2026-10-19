import {
  createSessionBackend,
  DataDirectory,
  type BackendRequest,
  type BackendResponse,
  type SessionBackend,
} from '@tavern-studio/backend';
import {
  HOST_KEY,
  type DeviceIdentity,
  type DiagnosticEntry,
  type PageAgent,
  type PreviewHost,
  type ViewConnection,
  type WebHostOptions,
  type WebHostRequest,
  type WebHostResponse,
} from '@tavern-studio/preview';
import { clearBrowserState } from './browser-state';
import { EXTENSIONS, installExtension } from './extensions';
import { publishChange, publishSession, readSessionState } from './publish';
import { loadFixture, loadVendorImages, loadVendorInfo, type VendorImage } from './sources';

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
}

interface Opened {
  vendor: VendorImage;
  data: DataDirectory;
  backend: SessionBackend;
}

/**
 * The one preview Session of this browser (docs/Architecture.md §2): the
 * Session Backend over the fixture's data, published for the Preview SW, and
 * the host every View's vendor page connects to.
 */
export class PreviewSession implements PreviewHost {
  #status: SessionStatus = { phase: 'opening', step: 'worker' };
  #fixture: string | undefined;
  /** `selected` is the image the next Session opens: the first built one until the user picks. */
  #vendors: VendorChoice = { images: [], selected: undefined };
  #opened: Opened | undefined;
  #opening: Promise<void> | undefined;
  /** Publishing of session writes, in write order. */
  #published: Promise<void> = Promise.resolve();
  /** The Web Host's own document for a TauriTavern Session (docs/Vendors.md §3). */
  #webHostState: Record<string, unknown> | null = null;
  #listeningToWorker = false;
  /** Keyed by frame, which is how a connecting page finds its View. */
  readonly #views = new Map<Element, View>();
  readonly #viewsClosed = new Set<() => void>();
  readonly #listeners = new Set<() => void>();
  readonly #diagnostics: DiagnosticEntry[] = [];
  readonly #diagnosticListeners = new Set<() => void>();

  get status(): SessionStatus {
    return this.#status;
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

  /** Opens the Session once; later calls share the first. */
  open(fixture: string): Promise<void> {
    this.#fixture = fixture;
    this.#opening ??= this.#open(fixture).catch((error: unknown) => {
      this.#setStatus({
        phase: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return this.#opening;
  }

  /** Retries after a failure. */
  reopen(fixture: string): Promise<void> {
    this.#opening = undefined;
    this.#setStatus({ phase: 'opening', step: 'worker' });
    return this.open(fixture);
  }

  /**
   * Switches to another vendor image: a new Session on the same fixture. The
   * Views close first, because clearing the previous image's browser state
   * needs every vendor page gone (docs/Architecture.md §7).
   */
  async selectVendor(id: string): Promise<void> {
    const fixture = this.#fixture;
    if (fixture === undefined) throw new Error('The preview Session has not been opened');
    if (this.#vendors.selected === id) return;
    await this.retireViews();
    this.#vendors = { ...this.#vendors, selected: id };
    this.#opened = undefined;
    this.#opening = undefined;
    this.#setStatus({ phase: 'opening', step: 'worker' });
    await this.#closedViews();
    await this.open(fixture);
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
      [...this.#views.values()].map(
        (view) =>
          new Promise<void>((resolve) => {
            view.onRetire();
            view.frame.addEventListener('load', () => resolve(), { once: true });
            view.frame.src = 'about:blank';
          }),
      ),
    );
  }

  /**
   * Writes a file of the Session's data, for example when a mounted project
   * file changes. Resolves once the Preview SW serves the new content.
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
      handle: (request) => this.#handle(opened.backend, request),
      readData: (path) => opened.data.read(path),
      report: (entry) => this.#report(entry),
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
      backend: { handle: (request) => this.#handleSync(opened.backend, request) },
      store: {
        load: () => this.#webHostState && page.structuredClone(this.#webHostState),
        save: (value) => {
          this.#webHostState = structuredClone(value);
        },
      },
    };
  }

  #viewOf(page: Window): { view: View; opened: Opened } {
    const view = page.frameElement && this.#views.get(page.frameElement);
    const opened = this.#opened;
    if (!view || !opened) throw new Error('A vendor page loaded outside a registered preview View');
    return { view, opened };
  }

  async #open(fixture: string): Promise<void> {
    const started = performance.now();
    const worker = await registerWorker();
    this.#listenToWorker();
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
    const [info, files, extensions, previous] = await Promise.all([
      loadVendorInfo(vendor.id),
      loadFixture(fixture),
      Promise.all(EXTENSIONS.map(installExtension)).then((installed) => installed.flat()),
      readSessionState(),
    ]);
    // Browser-side state follows the vendor image that wrote it (docs/Architecture.md §7).
    if (previous && previous.vendor !== vendor.id) await clearBrowserState();
    const data = new DataDirectory([
      ...files.files,
      ...extensions.map((file): [string, Uint8Array] => [file.path, file.bytes]),
    ]);
    const hashes = new Map([
      ...files.hashes,
      ...extensions.map((file): [string, string] => [file.path, file.sha256]),
    ]);
    await publishSession(data, hashes, { vendor: vendor.id }, worker);
    data.onChange((path) => {
      this.#published = this.#published
        .then(() => publishChange(data, path))
        .catch((error: unknown) => this.#reportFailure(`Publishing ${path}`, error));
    });

    this.#webHostState = null;
    this.#opened = { vendor, data, backend: createSessionBackend(data, info) };
    (window as Window & { [HOST_KEY]?: PreviewHost })[HOST_KEY] = this;
    performance.measure('studio:session-worker', { start: started, end: workerReady });
    performance.measure('studio:session-data', { start: workerReady });
    this.#setStatus({ phase: 'open', vendor });
  }

  /** API requests that reach the Preview SW come from a context without an API layer. */
  #listenToWorker(): void {
    if (this.#listeningToWorker) return;
    this.#listeningToWorker = true;
    navigator.serviceWorker.addEventListener(
      'message',
      (event: MessageEvent<{ type?: string; message?: string; url?: string }>) => {
        if (event.data.type !== 'unanswered-request') return;
        this.#report({
          level: 'error',
          kind: 'request',
          message: event.data.message ?? '',
          ...(event.data.url ? { url: event.data.url } : {}),
          frame: 'worker',
          time: Date.now(),
        });
      },
    );
  }

  #closedViews(): Promise<void> {
    if (this.#views.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.#viewsClosed.add(resolve));
  }

  /** Server semantics: a handler that throws answers 500, and every failure is reported. */
  #handle(
    backend: SessionBackend,
    request: BackendRequest,
  ): BackendResponse | Promise<BackendResponse> {
    const failed = (error: unknown): BackendResponse => {
      this.#reportFailure(`${request.method} ${request.url}`, error);
      return {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: String(error) }),
      };
    };
    const inspect = (response: BackendResponse): BackendResponse => {
      if (response.status === 501) {
        this.#report({
          level: 'warning',
          kind: 'request',
          message: `${request.method} ${request.url} is not implemented`,
          frame: 'backend',
          time: Date.now(),
        });
      }
      return response;
    };
    try {
      const result = backend.handle(request);
      return result instanceof Promise ? result.then(inspect, failed) : inspect(result);
    } catch (error) {
      return failed(error);
    }
  }

  /** The Web Host's backend port: synchronous, with text bodies. */
  #handleSync(backend: SessionBackend, request: WebHostRequest): WebHostResponse {
    const { method, url, headers, body } = request;
    const response = this.#handle(backend, { method, url, headers: { ...headers }, body });
    if (response instanceof Promise) {
      throw new Error(`${method} ${url} has no synchronous handler for the Web Host`);
    }
    if (response.body !== null && typeof response.body !== 'string') {
      throw new Error(`${method} ${url} answered with bytes; the Web Host takes text`);
    }
    return { status: response.status, headers: response.headers, body: response.body ?? '' };
  }

  #report(entry: DiagnosticEntry): void {
    this.#diagnostics.push(entry);
    for (const listener of this.#diagnosticListeners) listener();
  }

  #reportFailure(what: string, error: unknown): void {
    this.#report({
      level: 'error',
      kind: 'request',
      message: `${what} failed: ${error instanceof Error ? error.message : String(error)}`,
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      frame: 'backend',
      time: Date.now(),
    });
  }

  #setStatus(status: SessionStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}

const WORKER = '/_studio/preview-sw.js';

/**
 * Registers the Preview SW unless it already is. Registering again would wait
 * behind the update checks every navigation starts (1.6 s after a few preview
 * reloads); those checks keep an existing registration current by themselves.
 */
async function registerWorker(): Promise<ServiceWorker> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing?.active?.scriptURL.endsWith(WORKER)) {
    await navigator.serviceWorker.register(WORKER, { scope: '/', updateViaCache: 'none' });
  }
  const worker = (await navigator.serviceWorker.ready).active;
  if (!worker) throw new Error('The Preview SW did not activate');
  return worker;
}

export const previewSession = new PreviewSession();
