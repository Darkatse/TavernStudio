import type { BackendRequest, BackendResponse } from '@tavern-studio/backend';

/**
 * What Studio offers a vendor page. Studio installs it on its own window as
 * `__TAVERN_STUDIO__`; Attach, running first in the page, connects through it.
 */
export interface PreviewHost {
  /** Registers the vendor page of a View. Throws for a frame Studio did not create. */
  connect(page: Window): ViewConnection;
}

export interface ViewConnection {
  vendorId: string;
  device: DeviceIdentity;
  /** Answers SillyTavern's HTTP API from the Session Backend. */
  handle(request: BackendRequest): BackendResponse | Promise<BackendResponse>;
  /** Reads a data file synchronously, for the synchronous XHR the Preview SW cannot see. */
  readData(path: string): Uint8Array | undefined;
  report(entry: DiagnosticEntry): void;
  /** SillyTavern emitted APP_READY. */
  ready(): void;
}

/** How the page identifies the device. Absent fields keep the browser's own values. */
export interface DeviceIdentity {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
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
