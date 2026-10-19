/**
 * The Session Backend speaks SillyTavern's HTTP API as plain data, so the same
 * calls work from any realm and synchronously when the handler allows it.
 * This is also the `backend.handle` contract of TauriTavern's Web Host
 * (docs/Vendors.md §3).
 */
export interface BackendRequest {
  method: string;
  /** Path and query, for example `/api/chats/get`. */
  url: string;
  headers: Record<string, string>;
  body: BackendBody;
}

export type BackendBody = string | Uint8Array | FormEntries | null;

/** A multipart body, read into plain data. */
export interface FormEntries {
  kind: 'form';
  entries: [name: string, value: string | FormFile][];
}

export interface FormFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface BackendResponse {
  status: number;
  headers: Record<string, string>;
  /** A stream carries server-sent events, such as streamed generation. */
  body: string | Uint8Array | ReadableStream<Uint8Array> | null;
}

/**
 * A text field of a JSON body. Numbers count as text, as SillyTavern's
 * `String(request.body.x)` reads them; anything else is absent.
 */
export function text(body: unknown, name: string): string | undefined {
  const value =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

export function json(data: unknown, status = 200): BackendResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  };
}

export function empty(status: number): BackendResponse {
  return { status, headers: {}, body: null };
}

export function plain(message: string, status = 200): BackendResponse {
  return { status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: message };
}

/** Express's `sendStatus(200)`, which SillyTavern answers most writes with. */
export function ok(): BackendResponse {
  return plain('OK');
}
