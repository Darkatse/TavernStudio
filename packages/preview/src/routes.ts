/**
 * The Preview SW and the in-page API layer both route with these functions, so
 * a path means the same thing whether the browser or SillyTavern requests it.
 */

/** Nothing of the vendor lives here. */
export const STUDIO_ASSETS = '/_studio/';
export const VENDOR_IMAGES = '/__vendor/';

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname === '/csrf-token' || pathname === '/version';
}

/** Paths outside the vendor's URL space: Studio assets, vendor images and dev tooling. */
export function isStudioPath(pathname: string): boolean {
  return pathname.startsWith(STUDIO_ASSETS) || pathname.startsWith('/__');
}

export function vendorUrl(vendorId: string, pathname: string): string {
  return `${VENDOR_IMAGES}${vendorId}${pathname}`;
}

/** The image's descriptor beside it: version, extensions and file hashes. */
export function vendorDescriptorUrl(vendorId: string): string {
  return `${VENDOR_IMAGES}${vendorId}.json`;
}

export function anatomyUrl(vendorId: string, file: string): string {
  return `${VENDOR_IMAGES}anatomy/${vendorId}/${file}`;
}

/** URL prefix → data directory, as SillyTavern's user data routes map them (users.js). */
const DATA_ROUTES: readonly (readonly [url: string, data: string])[] = [
  ['/characters/', 'default-user/characters/'],
  ['/backgrounds/', 'default-user/backgrounds/'],
  ['/User Avatars/', 'default-user/User Avatars/'],
  ['/assets/', 'default-user/assets/'],
  ['/user/images/', 'default-user/user/images/'],
  ['/user/files/', 'default-user/user/files/'],
  ['/scripts/extensions/third-party/', 'default-user/extensions/'],
  ['/css/user.css', '_css/user.css'],
];

/** `/thumbnail?type=` → the folder holding the original. Studio serves originals. */
const THUMBNAIL_SOURCES: Record<string, string> = {
  avatar: 'default-user/characters/',
  bg: 'default-user/backgrounds/',
  persona: 'default-user/User Avatars/',
};

/**
 * The data file a request reads, or null when the URL is not a data
 * subresource. Paths that try to leave their folder read as null.
 */
export function dataPathForUrl(url: URL): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (pathname === '/thumbnail') {
    const folder = THUMBNAIL_SOURCES[url.searchParams.get('type') ?? ''];
    const file = url.searchParams.get('file');
    return folder && file && isSafe(file) ? folder + file : null;
  }

  for (const [prefix, folder] of DATA_ROUTES) {
    if (pathname === prefix && !prefix.endsWith('/')) return folder;
    if (prefix.endsWith('/') && pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      return rest && isSafe(rest) ? folder + rest : null;
    }
  }
  return null;
}

/** The canonical URL path of a data file, or null if SillyTavern never serves it. */
export function urlPathForData(path: string): string | null {
  for (const [prefix, folder] of DATA_ROUTES) {
    if (path === folder && !folder.endsWith('/')) return encodePath(prefix);
    if (folder.endsWith('/') && path.startsWith(folder) && path.length > folder.length) {
      return encodePath(prefix + path.slice(folder.length));
    }
  }
  return null;
}

function isSafe(relative: string): boolean {
  return !relative.split('/').some((segment) => segment === '..' || segment === '.');
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
