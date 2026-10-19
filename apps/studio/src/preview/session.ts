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
  type PreviewHost,
  type ViewConnection,
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

interface View {
  device: DeviceIdentity;
  onReady(): void;
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
  #opened: Opened | undefined;
  #opening: Promise<void> | undefined;
  /** Publishing of session writes, in write order. */
  #published: Promise<void> = Promise.resolve();
  readonly #views = new Map<Element, View>();
  readonly #listeners = new Set<() => void>();
  readonly #diagnostics: DiagnosticEntry[] = [];
  readonly #diagnosticListeners = new Set<() => void>();

  get status(): SessionStatus {
    return this.#status;
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
   * Registers a View's frame before it navigates, so its vendor page can
   * connect. Returns the function that unregisters it.
   */
  addView(frame: HTMLIFrameElement, device: DeviceIdentity, onReady: () => void): () => void {
    const created = performance.now();
    this.#views.set(frame, {
      device,
      onReady: () => {
        performance.measure('studio:view-ready', { start: created });
        onReady();
      },
    });
    return () => this.#views.delete(frame);
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

  connect(page: Window): ViewConnection {
    const view = page.frameElement && this.#views.get(page.frameElement);
    const opened = this.#opened;
    if (!view || !opened) throw new Error('A vendor page loaded outside a registered preview View');
    return {
      vendorId: opened.vendor.id,
      device: view.device,
      handle: (request) => this.#handle(opened.backend, request),
      readData: (path) => opened.data.read(path),
      report: (entry) => this.#report(entry),
      ready: () => view.onReady(),
    };
  }

  async #open(fixture: string): Promise<void> {
    const started = performance.now();
    const worker = await registerWorker();
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
    const workerReady = performance.now();

    this.#setStatus({ phase: 'opening', step: 'data' });
    const [vendor] = await loadVendorImages();
    if (!vendor) throw new Error('No vendor image is built (run `pnpm vendor:st 1.19.0`)');
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

    this.#opened = { vendor, data, backend: createSessionBackend(data, info) };
    (window as Window & { [HOST_KEY]?: PreviewHost })[HOST_KEY] = this;
    performance.measure('studio:session-worker', { start: started, end: workerReady });
    performance.measure('studio:session-data', { start: workerReady });
    this.#setStatus({ phase: 'open', vendor });
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
