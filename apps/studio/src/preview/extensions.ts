import { STUDIO_CACHE_PREFIX } from '@tavern-studio/preview';
import { verifiedBytes } from './verified-bytes';

/**
 * Third-party extensions are installed from their upstream repositories at a
 * pinned version, the way SillyTavern's installer clones them. Files come
 * from jsDelivr, are checked against its SHA-256 and kept in Studio's own
 * cache, so later Sessions install offline.
 */
export interface ExtensionSource {
  /** The folder under extensions/, which names the extension in SillyTavern. */
  name: string;
  /** GitHub `owner/repository`. */
  repository: string;
  version: string;
}

export const EXTENSIONS: readonly ExtensionSource[] = [
  { name: 'JS-Slash-Runner', repository: 'N0VI028/JS-Slash-Runner', version: '4.11.3' },
];

export const EXTENSION_CACHE = `${STUDIO_CACHE_PREFIX}extensions`;

export interface InstalledFile {
  path: string;
  bytes: Uint8Array;
  sha256: string;
}

interface Listing {
  files: { name: string; hash: string }[];
}

export async function installExtension(source: ExtensionSource): Promise<InstalledFile[]> {
  const cache = await caches.open(EXTENSION_CACHE);
  const ref = `${source.repository}@${source.version}`;
  const listing = JSON.parse(
    new TextDecoder().decode(
      await cachedBytes(cache, `https://data.jsdelivr.com/v1/packages/gh/${ref}?structure=flat`),
    ),
  ) as Listing;

  return Promise.all(
    listing.files
      // Only developer tools ask for source maps.
      .filter((file) => !file.name.endsWith('.map'))
      .map(async (file) => {
        const url = `https://cdn.jsdelivr.net/gh/${ref}${file.name.split('/').map(encodeURIComponent).join('/')}`;
        const digest = hexOfBase64(file.hash);
        return {
          path: `default-user/extensions/${source.name}${file.name}`,
          bytes: await verifiedBytes(cache, url, digest),
          sha256: digest,
        };
      }),
  );
}

function hexOfBase64(base64: string): string {
  return Array.from(atob(base64), (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join(
    '',
  );
}

async function cachedBytes(cache: Cache, url: string): Promise<Uint8Array> {
  let response = await cache.match(url);
  if (!response) {
    response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
    await cache.put(url, response.clone());
  }
  return new Uint8Array(await response.arrayBuffer());
}
