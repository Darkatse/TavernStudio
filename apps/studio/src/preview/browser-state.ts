import { SESSION_CACHE } from '@tavern-studio/preview';
import { DATABASE } from '../storage/db';
import { EXTENSION_CACHE } from './extensions';

/**
 * Studio's own storage on the origin. Everything else is browser-side state
 * written by the vendor and the code it runs.
 */
const STUDIO_CACHES = new Set([SESSION_CACHE, EXTENSION_CACHE]);
const STUDIO_DATABASES = new Set([DATABASE]);
/** app-use's snapshot counter belongs to the Agent: refs must never repeat within a Run. */
const AGENT_KEYS = new Set(['tauritavern:in_app_agent_snapshot_sequence']);

/**
 * Call it with no vendor page open: a database with an open connection
 * cannot be deleted, and that fails here instead of waiting forever.
 */
export async function clearBrowserState(): Promise<void> {
  for (const key of Object.keys(localStorage)) {
    if (!AGENT_KEYS.has(key)) localStorage.removeItem(key);
  }
  sessionStorage.clear();

  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .map((database) => database.name)
      .filter((name): name is string => name !== undefined && !STUDIO_DATABASES.has(name))
      .map(deleteDatabase),
  );

  for (const name of await caches.keys()) {
    if (!STUDIO_CACHES.has(name)) await caches.delete(name);
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.addEventListener('success', () => resolve());
    request.addEventListener('error', () =>
      reject(request.error ?? new Error(`Could not delete database ${name}`)),
    );
    request.addEventListener('blocked', () =>
      reject(new Error(`Database ${name} is still open in a vendor page`)),
    );
  });
}
