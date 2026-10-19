import type { ElementTarget, JsonValue, ToolArguments } from '@tauritavern/app-use';
import type { BackendRequest, BackendResponse } from '@tavern-studio/backend';

/**
 * Studio installs it on its own window as `__TAVERN_STUDIO__`; Attach, running
 * first in the page, connects through it.
 */
export interface PreviewHost {
  /** Throws for a frame Studio did not create. */
  connect(page: Window, agent: PageAgent): ViewConnection;
  webHost(page: Window): WebHostOptions;
  /**
   * How the page exits before its View is removed: TauriTavern's Web Host
   * `exit()`, which resolves once TT has saved through its own close path.
   */
  exitThrough(page: Window, exit: () => Promise<void>): void;
}

/** Each call belongs to a Run; a new Run drops the refs of the previous one. */
export interface PageAgent {
  snapshot(runId: string, args: ToolArguments): JsonValue;
  interact(runId: string, args: ToolArguments): JsonValue;
  /** Runs an async function body in the page's realm; the result is the page's own value. */
  evaluate(runId: string, code: string): Promise<unknown>;
  /**
   * The element a target names, by the rule `app.interact` addresses one by:
   * a ref of the Run's latest snapshot, or a selector matching exactly one
   * observable element. Throws the engine's error otherwise.
   */
  resolve(runId: string, target: ElementTarget): Element;
  /** The refs of the Run's latest snapshot page, in its order; none before its first snapshot. */
  refs(runId: string): string[];
  /** Renders from the DOM, the whole page when `element` is undefined: the screenshot fallback. */
  capture(element: Element | undefined): Promise<PageCapture>;
}

/** `warnings` are the degradations snapdom recorded. */
export interface PageCapture {
  blob: Blob;
  warnings: string[];
}

/**
 * How screenshots are encoded for the model, whichever way they are taken;
 * every provider takes JPEG.
 */
export const CAPTURE_IMAGE = {
  format: 'jpeg',
  mimeType: 'image/jpeg',
  quality: 0.85,
  /** Wider screenshots are scaled down to this many pixels. */
  maxWidth: 1280,
} as const;

export type VendorKind = 'st' | 'tt';

export interface ViewConnection {
  vendorId: string;
  /** SillyTavern's API goes through ST 接入; TauriTavern's through its own host kernel and the Web Host. */
  vendorKind: VendorKind;
  device: DeviceIdentity;
  handle(request: BackendRequest): BackendResponse | Promise<BackendResponse>;
  /** Reads a data file synchronously, for the synchronous XHR the Preview SW cannot see. */
  readData(path: string): Uint8Array | undefined;
  report(entry: DiagnosticEntry): void;
  /** The page emitted APP_READY. */
  ready(): void;
}

/** Both describe the same device. */
export interface DeviceIdentity {
  /** What SillyTavern reads. Absent fields keep the browser's own values. */
  navigator: { userAgent?: string; platform?: string; maxTouchPoints?: number };
  /** What TauriTavern reads from its host. Only real platforms exist. */
  host: HostIdentity;
}

export interface HostIdentity {
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'ohos';
  kind: 'desktop' | 'mobile';
}

/**
 * `installWebHost` options (TauriTavern docs/CurrentState/WebHost.md). Every
 * port answers synchronously. Bodies are JSON strings, a GET has none, a
 * character edit is a text-only form, and streamed generation answers with a
 * stream of server-sent events.
 */
export interface WebHostOptions {
  identity: HostIdentity;
  backend: { handle(request: WebHostRequest): WebHostResponse };
  /** The Web Host's own document. Studio keeps it with the Session and never reads it. */
  store: { load(): Record<string, unknown> | null; save(value: Record<string, unknown>): void };
}

export interface WebHostRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | { kind: 'form'; entries: [name: string, value: string][] } | null;
}

export interface WebHostResponse {
  status: number;
  headers: Record<string, string>;
  /** Always text for an error status, which becomes the error message. */
  body: string | ReadableStream<Uint8Array>;
}

export interface DiagnosticEntry {
  level: 'error' | 'warning';
  /**
   * Where the entry came from: an uncaught error, a rejection, console.error,
   * a failed load, an unanswered request, a hot-apply the vendor did not take,
   * or a Session write IndexedDB did not keep.
   */
  kind: 'error' | 'rejection' | 'console' | 'resource' | 'request' | 'hot-apply' | 'storage';
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  /** `page` for the vendor page, otherwise the iframe's id or name. */
  frame: string;
  time: number;
}

export const HOST_KEY = '__TAVERN_STUDIO__';
