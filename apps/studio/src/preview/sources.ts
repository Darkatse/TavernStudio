import type { VendorInfo } from '@tavern-studio/backend';
import { VENDOR_IMAGES, type ThemeAnatomy, type VendorKind } from '@tavern-studio/preview';

/** A built vendor image, as listed in /__vendor/index.json (vendors/lib/image.mjs). */
export interface VendorImage {
  id: string;
  kind: VendorKind;
  version: string;
  label: string;
}

/** A directory Studio ships under /_studio/ (apps/studio/build/published.ts). */
export interface PublishedDirectory {
  files: [path: string, bytes: Uint8Array][];
  /** SHA-256 of each file; for a fixture, its identity in a Snapshot. */
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

/** The image's anatomy of its theme controls (vendors/lib/anatomy.mjs). */
export function loadAnatomy(id: string): Promise<ThemeAnatomy> {
  return getJson<ThemeAnatomy>(
    `${VENDOR_IMAGES}anatomy/${id}/theme.json`,
    `the anatomy of ${id} (run \`pnpm vendor:anatomy ${id}\`)`,
  );
}

export function loadFixture(name: string): Promise<PublishedDirectory> {
  return loadPublished('fixtures', name);
}

export function loadTemplate(name: string): Promise<PublishedDirectory> {
  return loadPublished('templates', name);
}

async function loadPublished(
  kind: 'fixtures' | 'templates',
  name: string,
): Promise<PublishedDirectory> {
  const base = `/_studio/${kind}/${name}/`;
  const what = `${kind === 'fixtures' ? 'fixture' : 'template'} ${name}`;
  const index = await getJson<{ files: Record<string, { sha256: string }> }>(
    `${base}index.json`,
    what,
  );
  const entries = await Promise.all(
    Object.entries(index.files).map(async ([path, { sha256 }]) => {
      const response = await fetch(base + path.split('/').map(encodeURIComponent).join('/'));
      if (!response.ok) throw new Error(`The ${what}: ${path} returned HTTP ${response.status}`);
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
