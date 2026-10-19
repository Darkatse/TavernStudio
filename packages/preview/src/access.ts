/**
 * ST 接入 (docs/Architecture.md §4): answers SillyTavern's HTTP API inside the
 * vendor page and in every same-origin frame it creates, because the Preview
 * SW cannot see synchronous XHR and must not hold business logic.
 *
 * fetch is replaced; XMLHttpRequest is patched in place, so requests the layer
 * does not answer keep the browser's own behaviour. Frames are patched when
 * they are inserted: the initial window of a srcdoc frame carries over to its
 * document, so card scripts start with the layer already installed.
 */
import type { BackendBody, BackendResponse, FormEntries } from '@tavern-studio/backend';
import type { ViewConnection } from './host';
import type { Realm } from './realm';
import { dataPathForUrl, isApiPath, isStudioPath, vendorUrl } from './routes';

type Connection = Pick<ViewConnection, 'handle' | 'readData' | 'vendorId'>;

const installed = new WeakSet<Realm>();
const observed = new WeakSet<Document>();

/** Installs the layer into a window and everything it frames. Idempotent. */
export function installAccess(
  win: Realm,
  connection: Connection,
  onWindow: (win: Realm) => void,
): void {
  if (!installed.has(win)) {
    installed.add(win);
    patchFetch(win, connection);
    patchXhr(win, connection);
    onWindow(win);
    // A reused initial window gets a new document when its content loads.
    win.addEventListener('DOMContentLoaded', () => observeFrames(win, connection, onWindow));
  }
  observeFrames(win, connection, onWindow);
}

function observeFrames(win: Realm, connection: Connection, onWindow: (win: Realm) => void): void {
  const doc = win.document;
  if (observed.has(doc)) return;
  observed.add(doc);

  const adopt = (frame: HTMLIFrameElement) => {
    const install = () => {
      const child = sameOriginWindow(frame);
      if (child) installAccess(child, connection, onWindow);
    };
    install();
    frame.addEventListener('load', install);
  };

  doc.querySelectorAll('iframe').forEach(adopt);
  new win.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof win.Element)) continue;
        if (node instanceof win.HTMLIFrameElement) adopt(node);
        node.querySelectorAll('iframe').forEach(adopt);
      }
    }
  }).observe(doc, { childList: true, subtree: true });
}

function sameOriginWindow(frame: HTMLIFrameElement): Realm | null {
  try {
    const child = frame.contentWindow as Realm | null;
    return child && child.origin === frame.ownerDocument.defaultView?.origin ? child : null;
  } catch {
    return null;
  }
}

/** Resolves a request URL the way the page would; opaque base URLs fall back to the origin. */
function resolve(win: Realm, target: string | URL): URL {
  try {
    return new URL(target, win.document.baseURI);
  } catch {
    return new URL(target, win.location.origin);
  }
}

function isAnswered(win: Realm, url: URL): boolean {
  return url.origin === win.origin && isApiPath(url.pathname);
}

function patchFetch(win: Realm, connection: Connection): void {
  const nativeFetch = win.fetch.bind(win);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // A Request has `url`; a URL (from any realm) stringifies to its href.
    const url = resolve(
      win,
      typeof input === 'object' && 'url' in input ? input.url : String(input),
    );
    if (!isAnswered(win, url)) return nativeFetch(input, init);

    const request = new win.Request(input, init);
    if (request.signal.aborted) throw request.signal.reason;
    const response = await connection.handle({
      method: request.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers),
      body: await readBody(request),
    });
    if (request.signal.aborted) throw request.signal.reason;
    return toResponse(win, response);
  };
}

async function readBody(request: Request): Promise<BackendBody> {
  if (request.body === null) return null;
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const entries: FormEntries['entries'] = [];
    for (const [name, value] of form) {
      entries.push([
        name,
        typeof value === 'string'
          ? value
          : {
              name: value.name,
              type: value.type,
              bytes: new Uint8Array(await value.arrayBuffer()),
            },
      ]);
    }
    return { kind: 'form', entries };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return /json|text|urlencoded/.test(type) ? new TextDecoder().decode(bytes) : bytes;
}

/**
 * Responses come from Studio's realm. Checks here must not depend on the
 * realm (`instanceof Uint8Array` is false for Studio's arrays), and the
 * Response is built in the caller's realm so the page's own checks hold.
 */
function toResponse(win: Realm, response: BackendResponse): Response {
  const body = ArrayBuffer.isView(response.body) ? new Uint8Array(response.body) : response.body;
  return new win.Response(body, { status: response.status, headers: response.headers });
}

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as { then?: unknown }).then === 'function';
}

/**
 * A request the layer answers itself: an API call, or a synchronous read of a
 * data file (synchronous loads bypass the Preview SW).
 */
interface Answered {
  method: string;
  url: URL;
  async: boolean;
  dataPath: string | null;
  headers: Record<string, string>;
  aborted: boolean;
}

/**
 * Patches XMLHttpRequest.prototype. An answered request never reaches the
 * browser: open() still runs natively so header and state checks behave as
 * usual, then send() fills the response into own properties that shadow the
 * native getters and dispatches the events the browser would.
 */
function patchXhr(win: Realm, connection: Connection): void {
  const proto = win.XMLHttpRequest.prototype;
  // oxlint-disable-next-line typescript/unbound-method -- the originals are always called with .call(this)
  const { open, send, setRequestHeader, abort } = proto;
  const answered = new WeakMap<XMLHttpRequest, Answered>();

  proto.open = function (
    this: XMLHttpRequest,
    method: string,
    target: string | URL,
    async: boolean = true,
    ...credentials: [string | null | undefined, string | null | undefined]
  ) {
    const url = resolve(win, target);
    const sameOrigin = url.origin === win.origin;
    const dataPath = sameOrigin && !async ? dataPathForUrl(url) : null;
    answered.delete(this);
    if (isAnswered(win, url) || dataPath) {
      answered.set(this, {
        method: method.toUpperCase(),
        url,
        async,
        dataPath,
        headers: {},
        aborted: false,
      });
    } else if (sameOrigin && !async && !isStudioPath(url.pathname)) {
      // A synchronous vendor file load: request it from the image directly.
      target = vendorUrl(connection.vendorId, url.pathname);
    }
    open.call(this, method, target, async, ...credentials);
  } as typeof proto.open;

  proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    const request = answered.get(this);
    if (request) request.headers[name.toLowerCase()] = value;
    setRequestHeader.call(this, name, value);
  };

  proto.abort = function (this: XMLHttpRequest) {
    const request = answered.get(this);
    if (request) request.aborted = true;
    abort.call(this);
  };

  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const request = answered.get(this);
    if (!request) {
      send.call(this, body);
      return;
    }
    if (request.dataPath) {
      fulfil(win, this, readData(connection, request.dataPath));
      return;
    }

    const call = (requestBody: BackendBody) =>
      connection.handle({
        method: request.method,
        url: request.url.pathname + request.url.search,
        headers: request.headers,
        body: requestBody,
      });

    if (!request.async) {
      const result = call(plainBody(body));
      if (isThenable(result)) {
        throw new win.DOMException(
          `${request.method} ${request.url.pathname} has no synchronous handler`,
          'NetworkError',
        );
      }
      fulfil(win, this, result);
      return;
    }
    void (async () => {
      // FormData and Blob bodies are read the way fetch reads them.
      const requestBody = isPlain(body)
        ? plainBody(body)
        : await readBody(
            new win.Request(request.url, {
              method: request.method,
              headers: request.headers,
              body: body as BodyInit,
            }),
          );
      const response = await call(requestBody);
      if (!request.aborted) fulfil(win, this, response);
    })();
  };
}

function readData(connection: Connection, path: string): BackendResponse {
  const bytes = connection.readData(path);
  return bytes
    ? { status: 200, headers: {}, body: bytes }
    : { status: 404, headers: {}, body: null };
}

type XhrBody = Document | XMLHttpRequestBodyInit | null | undefined;

/** Bodies that can be read synchronously. Tags are compared because frames have their own constructors. */
function isPlain(body: XhrBody): boolean {
  const tag = Object.prototype.toString.call(body);
  return (
    body === null ||
    body === undefined ||
    typeof body === 'string' ||
    ArrayBuffer.isView(body) ||
    tag === '[object ArrayBuffer]' ||
    tag === '[object URLSearchParams]'
  );
}

function plainBody(body: XhrBody): BackendBody {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body;
  if (ArrayBuffer.isView(body))
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  const tag = Object.prototype.toString.call(body);
  if (tag === '[object ArrayBuffer]') return new Uint8Array(body as ArrayBuffer);
  if (tag === '[object URLSearchParams]') return (body as URLSearchParams).toString();
  throw new Error('A synchronous XHR can only send text or bytes to the preview backend');
}

const decoder = new TextDecoder();

/** Makes an XHR look completed with `response`, as the browser would. */
function fulfil(win: Realm, xhr: XMLHttpRequest, response: BackendResponse): void {
  const text =
    response.body === null
      ? ''
      : typeof response.body === 'string'
        ? response.body
        : decoder.decode(response.body);
  const headerLines = Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`);
  define(xhr, {
    status: response.status,
    statusText: response.status >= 200 && response.status < 300 ? 'OK' : '',
    responseURL: '',
    responseText: text,
    response: responseFor(xhr.responseType, text, response),
    getResponseHeader: (name: string) => response.headers[name.toLowerCase()] ?? null,
    getAllResponseHeaders: () => headerLines.map((line) => `${line}\r\n`).join(''),
  });
  for (const readyState of [2, 3, 4]) {
    define(xhr, { readyState });
    xhr.dispatchEvent(new win.Event('readystatechange'));
  }
  xhr.dispatchEvent(new win.ProgressEvent('load'));
  xhr.dispatchEvent(new win.ProgressEvent('loadend'));
}

function responseFor(
  type: XMLHttpRequestResponseType,
  text: string,
  response: BackendResponse,
): unknown {
  switch (type) {
    case '':
    case 'text':
      return text;
    case 'json':
      return text === '' ? null : (JSON.parse(text) as unknown);
    case 'arraybuffer':
      return typeof response.body === 'string'
        ? new TextEncoder().encode(response.body).buffer
        : (response.body?.slice().buffer ?? new ArrayBuffer(0));
    case 'blob':
      return new Blob(
        response.body === null
          ? []
          : [typeof response.body === 'string' ? response.body : response.body.slice()],
        {
          type: response.headers['content-type'] ?? '',
        },
      );
    case 'document':
      throw new Error('Studio does not answer XHR with responseType "document"');
  }
}

function define(target: object, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(target, key, { configurable: true, value });
  }
}
