import { sha256 } from '@tavern-studio/workspace';

/**
 * Bytes whose SHA-256 is known before they are fetched: checked once, then
 * kept in Cache Storage under a key that names the digest, so a later start
 * reads them without asking the network.
 */
export async function verifiedBytes(
  cache: Cache,
  url: string,
  digest: string,
): Promise<Uint8Array> {
  const key = verifiedKey(url, digest);
  const cached = await cache.match(key);
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = await sha256(bytes);
  if (actual !== digest) throw new Error(`${url} has SHA-256 ${actual}, expected ${digest}`);
  await cache.put(key, new Response(bytes));
  return bytes;
}

export function verifiedKey(url: string, digest: string): string {
  return `${new URL(url, location.href).href.replace(/[?#].*$/, '')}?sha256=${digest}`;
}
