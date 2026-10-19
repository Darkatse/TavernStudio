import type { VendorInfo } from '@tavern-studio/backend';
import { VENDOR_IMAGES, type ThemeAnatomy, type VendorKind } from '@tavern-studio/preview';

/** As vendors/lib/image.mjs lists it in /__vendor/index.json. */
export interface VendorImage {
  id: string;
  kind: VendorKind;
  version: string;
  label: string;
}

/** As apps/studio/build/published.ts ships it under /_studio/. */
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

const imageFiles = new Map<string, Promise<ReadonlySet<string>>>();

/** Paths below the image's root, listed once, as an image's id never changes. */
export function loadVendorFiles(id: string): Promise<ReadonlySet<string>> {
  let files = imageFiles.get(id);
  if (!files) {
    files = getJson<{ files: Record<string, string> }>(
      `${VENDOR_IMAGES}${id}.json`,
      `vendor image ${id}`,
    ).then((image) => new Set(Object.keys(image.files)));
    files.catch(() => imageFiles.delete(id));
    imageFiles.set(id, files);
  }
  return files;
}

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

export async function getJson<T>(url: string, what: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${what}: HTTP ${response.status}`);
  return (await response.json()) as T;
}
