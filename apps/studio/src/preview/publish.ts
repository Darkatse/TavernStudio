import type { DataDirectory } from '@tavern-studio/backend';
import {
  SESSION_CACHE,
  SESSION_STATE_URL,
  urlPathForData,
  type SessionState,
} from '@tavern-studio/preview';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  json: 'application/json; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  map: 'application/json; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Publishes a Session's data subresources to Cache Storage, where the Preview
 * SW serves them, and tells the worker which vendor image is open.
 */
export async function publishSession(
  data: DataDirectory,
  hashes: ReadonlyMap<string, string>,
  state: SessionState,
  worker: ServiceWorker,
): Promise<void> {
  await caches.delete(SESSION_CACHE);
  const cache = await caches.open(SESSION_CACHE);
  await Promise.all(
    [...data.paths()].map((path) => publishFile(cache, data, path, hashes.get(path))),
  );
  await cache.put(SESSION_STATE_URL, Response.json(state));
  worker.postMessage({ type: 'session-changed' });
}

/** What the last Session published, from any earlier visit. */
export async function readSessionState(): Promise<SessionState | null> {
  const stored = await (await caches.open(SESSION_CACHE)).match(SESSION_STATE_URL);
  return stored ? ((await stored.json()) as SessionState) : null;
}

/** Republishes one file after a session write or deletion. */
export async function publishChange(data: DataDirectory, path: string): Promise<void> {
  const cache = await caches.open(SESSION_CACHE);
  const urlPath = urlPathForData(path);
  if (urlPath && !data.has(path)) await cache.delete(urlPath);
  else await publishFile(cache, data, path);
}

async function publishFile(
  cache: Cache,
  data: DataDirectory,
  path: string,
  hash?: string,
): Promise<void> {
  const urlPath = urlPathForData(path);
  const bytes = data.read(path);
  if (!urlPath || !bytes) return;
  const etag = hash ?? (await sha256(bytes));
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  await cache.put(
    urlPath,
    new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
        'content-length': String(bytes.length),
        // The content hash, so revalidating clients see replaced files (docs/Architecture.md §4).
        etag: `"${etag}"`,
        'cache-control': 'no-cache',
      },
    }),
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
