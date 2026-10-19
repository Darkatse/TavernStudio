import type { DeviceIdentity, DiagnosticEntry, PageAgent } from '@tavern-studio/preview';

/** What a View's frame tells the Session, and how the Session tells it back. */
export interface ViewHooks {
  device: DeviceIdentity;
  /** The vendor page emitted APP_READY. */
  onReady(): void;
  /** The vendor page is being unloaded, ahead of the View being removed. */
  onRetire(): void;
}

export interface View extends ViewHooks {
  frame: HTMLIFrameElement;
  /** Set once the vendor page has connected and emitted APP_READY. */
  agent?: PageAgent;
  /** The page's own way to save and close, when it has one (TauriTavern). */
  exit?: () => Promise<void>;
}

/** How long a page may take to save on exit before its View is removed anyway. */
const EXIT_TIMEOUT_MS = 5000;

/**
 * The Session's Views, keyed by frame, which is how a connecting vendor page
 * finds its View, and the order in which they unload (docs/Architecture.md §4).
 */
export class Views {
  readonly #views = new Map<Element, View>();
  readonly #closed = new Set<() => void>();
  readonly #report: (entry: DiagnosticEntry) => void;

  constructor(report: (entry: DiagnosticEntry) => void) {
    this.#report = report;
  }

  get(frame: Element | null): View | undefined {
    return frame ? this.#views.get(frame) : undefined;
  }

  all(): View[] {
    return [...this.#views.values()];
  }

  /**
   * Registers a View's frame before it navigates, so its vendor page can
   * connect. Returns the function that unregisters it.
   */
  add(frame: HTMLIFrameElement, hooks: ViewHooks): () => void {
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
      for (const resolve of this.#closed) resolve();
      this.#closed.clear();
    };
  }

  /**
   * Unloads every View's vendor page while its frame is still in the
   * document, as a reload of the real page would. Call it before anything
   * removes a View: vendors save on pagehide (TauriTavern flushes its
   * settings and chat then), and a frame that is already removed has a
   * detached realm in which those saves fail.
   */
  async retire(): Promise<void> {
    await Promise.all(
      this.all().map(async (view) => {
        view.onRetire();
        await this.#exit(view);
        await new Promise<void>((resolve) => {
          view.frame.addEventListener('load', () => resolve(), { once: true });
          view.frame.src = 'about:blank';
        });
      }),
    );
  }

  /** Resolves once every View has been removed. */
  closed(): Promise<void> {
    if (this.#views.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.#closed.add(resolve));
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
}
