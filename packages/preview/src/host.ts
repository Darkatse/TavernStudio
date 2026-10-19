import type { JsonValue, ToolArguments } from '@tauritavern/app-use';
import type { BackendRequest, BackendResponse } from '@tavern-studio/backend';

/**
 * What Studio offers a vendor page. Studio installs it on its own window as
 * `__TAVERN_STUDIO__`; Attach, running first in the page, connects through it.
 */
export interface PreviewHost {
  /** Registers the vendor page of a View. Throws for a frame Studio did not create. */
  connect(page: Window, agent: PageAgent): ViewConnection;
  /** The Web Host options for the page of a TauriTavern View (docs/Vendors.md §3). */
  webHost(page: Window): WebHostOptions;
}

/**
 * The app-use engine running in a vendor page, for the Agent's `app.*` tools
 * (docs/Agent.md §4). Each call belongs to a Run; a new Run drops the refs of
 * the previous one.
 */
export interface PageAgent {
  snapshot(runId: string, args: ToolArguments): JsonValue;
  interact(runId: string, args: ToolArguments): JsonValue;
}

/** The frontend a vendor image ships. It decides how the page reaches the API. */
export type VendorKind = 'st' | 'tt';

export interface ViewConnection {
  vendorId: string;
  /** SillyTavern's API goes through ST 接入; TauriTavern's through its own host kernel and the Web Host. */
  vendorKind: VendorKind;
  device: DeviceIdentity;
  /** Answers SillyTavern's HTTP API from the Session Backend. */
  handle(request: BackendRequest): BackendResponse | Promise<BackendResponse>;
  /** Reads a data file synchronously, for the synchronous XHR the Preview SW cannot see. */
  readData(path: string): Uint8Array | undefined;
  report(entry: DiagnosticEntry): void;
  /** The page emitted APP_READY. */
  ready(): void;
}

/** How the page identifies the device. Both describe the same device. */
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
  /** Where the entry came from: an uncaught error, a rejection, console.error, a failed load or an unanswered request. */
  kind: 'error' | 'rejection' | 'console' | 'resource' | 'request';
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
