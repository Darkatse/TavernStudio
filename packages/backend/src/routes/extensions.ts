import type { Routes } from '../backend';
import { json } from '../http';
import { dirs } from '../paths';

export const extensionRoutes: Routes = {
  // Built-ins come from the vendor image; third-party extensions are the
  // Session's user extensions. Folders without a manifest are not extensions.
  'GET /api/extensions/discover': ({ data, vendor }) =>
    json([
      ...vendor.extensions.map((name) => ({ type: 'system', name })),
      ...data
        .directories(dirs.extensions)
        .filter((name) => data.has(`${dirs.extensions}/${name}/manifest.json`))
        .map((name) => ({ type: 'local', name: `third-party/${name}` })),
    ]),
};
