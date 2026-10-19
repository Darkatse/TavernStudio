import type { VendorInfo } from '@tavern-studio/backend';
import { VENDOR_IMAGES } from '@tavern-studio/preview';

/** A built vendor image, as listed in /__vendor/index.json (vendors/st/build.mjs). */
export interface VendorImage {
  id: string;
  kind: string;
  version: string;
  label: string;
}

export interface Fixture {
  files: [path: string, bytes: Uint8Array][];
  /** SHA-256 of each file, its identity in a Snapshot. */
  hashes: Map<string, string>;
}

export async function loadVendorImages(): Promise<VendorImage[]> {
  return getJson<VendorImage[]>(
    `${VENDOR_IMAGES}index.json`,
    'vendor images (run `pnpm vendor:st 1.19.0`)',
  );
}

export async function loadVendorInfo(id: string): Promise<VendorInfo> {
  const { version, extensions } = await getJson<VendorInfo>(
    `${VENDOR_IMAGES}${id}.json`,
    `vendor image ${id}`,
  );
  return { id, version, extensions };
}

export async function loadFixture(name: string): Promise<Fixture> {
  const base = `/_studio/fixtures/${name}/`;
  const index = await getJson<{ files: Record<string, { sha256: string }> }>(
    `${base}index.json`,
    `fixture ${name}`,
  );
  const entries = await Promise.all(
    Object.entries(index.files).map(async ([path, { sha256 }]) => {
      const response = await fetch(base + path.split('/').map(encodeURIComponent).join('/'));
      if (!response.ok)
        throw new Error(`Fixture ${name}: ${path} returned HTTP ${response.status}`);
      return { path, sha256, bytes: new Uint8Array(await response.arrayBuffer()) };
    }),
  );
  return {
    files: entries.map(({ path, bytes }) => [path, bytes]),
    hashes: new Map(entries.map(({ path, sha256 }) => [path, sha256])),
  };
}

async function getJson<T>(url: string, what: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${what}: HTTP ${response.status}`);
  return (await response.json()) as T;
}
