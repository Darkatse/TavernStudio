/**
 * The Preview SW holds no business logic: API requests belong to the in-page
 * layer, and one reaching the worker is reported as unanswered.
 */
import { SESSION_CACHE, SESSION_STATE_URL, type SessionState } from './cache';
import { dataPathForUrl, isApiPath, isStudioPath, urlPathForData, vendorUrl } from './routes';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

let state: Promise<SessionState | null> | undefined;

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'session-changed') state = undefined;
});

function sessionState(): Promise<SessionState | null> {
  state ??= caches
    .open(SESSION_CACHE)
    .then((cache) => cache.match(SESSION_STATE_URL))
    .then((response) => (response ? (response.json() as Promise<SessionState>) : null));
  return state;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isStudioPath(url.pathname)) return;
  // Top-level navigations are Studio's: the shell at `/`, a real 404 elsewhere.
  if (request.mode === 'navigate' && request.destination === 'document') return;
  event.respondWith(route(request, url));
});

async function route(request: Request, url: URL): Promise<Response> {
  if (isApiPath(url.pathname)) return unanswered(request, url);

  const session = await sessionState();
  if (!session) return new Response('No preview session is open', { status: 503 });

  const dataPath = dataPathForUrl(url);
  if (dataPath) return serveData(request, dataPath);

  const path = request.mode === 'navigate' && url.pathname === '/' ? '/index.html' : url.pathname;
  const response = await fetch(vendorUrl(session.vendor, path), {
    method: request.method,
    headers: request.headers,
    // An image's files are cached for good, but Studio writes into its
    // index.html, which can change under the same image id.
    ...(path === '/index.html' ? { cache: 'no-cache' as const } : {}),
  });
  return rehome(response);
}

async function serveData(request: Request, dataPath: string): Promise<Response> {
  const urlPath = urlPathForData(dataPath);
  const cache = await caches.open(SESSION_CACHE);
  const stored = urlPath ? await cache.match(urlPath) : undefined;
  if (!stored) return new Response('Not found', { status: 404 });
  if (request.method === 'HEAD')
    return new Response(null, { status: stored.status, headers: stored.headers });
  return rehome(stored);
}

/** Statuses whose responses have no body. WebKit still gives them an empty stream. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * A fresh Response without a URL, so the document keeps the URL it asked for.
 * Module scripts resolve imports against their response URL: serving
 * `/script.js` with the image URL would load a second copy of every module.
 *
 * What a preview URL holds depends on the session, so the page must come back
 * here each time: an image's own caching would let ST's `/script.js` stand in
 * for TT's from the browser's memory cache.
 */
function rehome(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-cache');
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function unanswered(request: Request, url: URL): Promise<Response> {
  const message = `${request.method} ${url.pathname} reached the Preview SW: the context that sent it has no API layer`;
  const studio = (await self.clients.matchAll({ type: 'window' })).find(
    (client) => client.frameType === 'top-level',
  );
  studio?.postMessage({ type: 'unanswered-request', message, url: url.pathname });
  return Response.json({ error: message }, { status: 501 });
}
